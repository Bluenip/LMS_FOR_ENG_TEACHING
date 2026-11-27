import { computeRubricTotal, type RubricCriterion, type RubricScoreMap } from "@/lib/grading";

/**
 * Everything the model may see. There is intentionally NO field for the student's name, email,
 * id, class or school: the type itself keeps grading requests free of personal data.
 */
export interface AnonymousGradingContext {
  questionType: "ESSAY" | "PHOTO_UPLOAD" | "CODE";
  questionPrompt: string;
  maxPoints: number;
  modelAnswer: string | null;
  rubric: RubricCriterion[];
  /** Student text (essay or code). Already passed through `redactPii`. */
  answerText: string | null;
  codeLanguage?: string | null;
  /** Answer photos as base64 (PHOTO_UPLOAD). */
  images?: Array<{ mimeType: string; data: string }>;
  locale: "vi" | "en";
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Strips Vietnamese diacritics ("Nguyễn" → "Nguyen"). */
export function foldDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFC");
}

/**
 * Removes personal identifiers a student may have typed into the answer (own name, email, ...):
 * the full term and each word of ≥ 4 letters, with or without diacritics, case-insensitive,
 * whole words only. E-mail addresses are always masked.
 */
export function redactPii(text: string, terms: Array<string | null | undefined>): string {
  const needles = new Set<string>();
  for (const t of terms) {
    const clean = t?.trim().normalize("NFC");
    if (!clean) continue;
    const variants = [clean, foldDiacritics(clean)];
    for (const v of variants) {
      if (v.length >= 3) needles.add(v);
      for (const w of v.split(/\s+/)) if (w.length >= 4) needles.add(w);
    }
  }
  let out = text.normalize("NFC");
  for (const n of Array.from(needles).sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(n)}(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, "[ẩn]");
  }
  return out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
}

export function buildRubricGradePrompt(ctx: AnonymousGradingContext): string {
  const lang = ctx.locale === "en" ? "English" : "Vietnamese";
  const rubricText =
    ctx.rubric.length > 0
      ? ctx.rubric
          .map((c) => `- id="${c.id}" | ${c.title}${c.description ? ` - ${c.description}` : ""} | max ${c.maxPoints}`)
          .join("\n")
      : "(no rubric: give one overall score)";
  return [
    "You are an experienced teacher's assistant suggesting a grade. The teacher will review and decide.",
    'Return STRICT JSON ONLY: { "rubricScores": { "<criterionId>": number }, "score": number, "comment": string }',
    `- score is between 0 and ${ctx.maxPoints} (multiples of 0.25). rubricScores must use exactly the criterion ids below, each within its max.`,
    `- comment: 2-4 encouraging, specific sentences in ${lang} addressed to the student (what is good, what to fix). Never mention any name.`,
    "",
    `Question type: ${ctx.questionType}${ctx.codeLanguage ? ` (${ctx.codeLanguage})` : ""}`,
    `Question: ${ctx.questionPrompt.slice(0, 4000)}`,
    `Max points: ${ctx.maxPoints}`,
    `Model answer / guidance: ${ctx.modelAnswer?.slice(0, 4000) || "(none)"}`,
    "Rubric:",
    rubricText,
    "",
    ctx.questionType === "PHOTO_UPLOAD"
      ? "Student answer: see the attached photo(s)."
      : `Student answer:\n${(ctx.answerText ?? "").slice(0, 12000) || "(blank)"}`,
  ].join("\n");
}

export function buildRubricGradeRequestBody(ctx: AnonymousGradingContext) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          { text: buildRubricGradePrompt(ctx) },
          ...(ctx.images ?? [])
            .slice(0, 4)
            .map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.data } })),
        ],
      },
    ],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  };
}

export interface ParsedRubricGrade {
  score: number;
  rubricScores: RubricScoreMap | null;
  comment: string;
}

const quarter = (v: number) => Math.round(v * 4) / 4;

/** Parses the model JSON and clamps every number to the rubric / question limits (Phase 16 rules). */
export function parseRubricGrade(raw: string, rubric: RubricCriterion[], maxPoints: number): ParsedRubricGrade | null {
  let text = raw.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(text);
  if (fenced) text = fenced[1]!.trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text.slice(first, last + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const comment = typeof obj.comment === "string" ? obj.comment.trim().slice(0, 1500) : "";
  if (rubric.length > 0) {
    const rawScores = (obj.rubricScores && typeof obj.rubricScores === "object" ? obj.rubricScores : {}) as Record<
      string,
      unknown
    >;
    const scores: RubricScoreMap = {};
    for (const c of rubric) {
      const v = Number(rawScores[c.id]);
      scores[c.id] = Number.isFinite(v) ? quarter(v) : 0;
    }
    const { total, clampedScores } = computeRubricTotal(rubric, scores, maxPoints);
    return { score: total, rubricScores: clampedScores, comment };
  }
  const s = Number(obj.score);
  if (!Number.isFinite(s)) return null;
  return { score: Math.max(0, Math.min(maxPoints, quarter(s))), rubricScores: null, comment };
}
