import type { WorksheetSubject } from "@prisma/client";
import { generateWordsearchGrid } from "@/lib/grading";

export type AiSupportedQuestionType =
  | "MULTIPLE_CHOICE"
  | "TRUE_FALSE_GROUP"
  | "TEXT"
  | "WORDSEARCH"
  | "ESSAY";

export interface AiGeneratedQuestionDraft {
  type: AiSupportedQuestionType;
  prompt: string;
  points: number;
  options: unknown;
  answerKey: Record<string, unknown>;
  explanation: string | null;
  topicTag: string | null;
}

/**
 * Builds a strict PII-free prompt instructing Gemini to emit raw JSON matching Pivora Field schemas.
 */
export function buildGeminiQuestionPrompt(input: {
  sourceText: string;
  subject: WorksheetSubject;
  count: number;
  types: AiSupportedQuestionType[];
  level?: string | null;
}): string {
  const safeCount = Math.max(1, Math.min(20, input.count));
  const typeList = input.types.join(", ");
  return [
    "You are an expert educational assessment author. Return STRICT JSON ONLY (an array of objects, no prose/markdown) matching these field schemas:",
    "- MULTIPLE_CHOICE: { type: 'MULTIPLE_CHOICE', prompt, points: 1, options: [{id:'A',text:...},{id:'B',text:...},{id:'C',text:...},{id:'D',text:...}], answerKey: { correct: 'A'|'B'|'C'|'D' }, explanation, topicTag }",
    "- TRUE_FALSE_GROUP: { type: 'TRUE_FALSE_GROUP', prompt, points: 1, options: [{id:'a',text:...},{id:'b',text:...},{id:'c',text:...},{id:'d',text:...}], answerKey: { correct: { a: true, b: false, c: true, d: false } }, explanation, topicTag }",
    "- TEXT: { type: 'TEXT', prompt, points: 1, options: null, answerKey: { accepted: ['answer1'] }, explanation, topicTag }",
    "- WORDSEARCH: { type: 'WORDSEARCH', prompt, points: 2, options: { words: ['WORD1','WORD2'], rows: 10, cols: 10, showWordList: true }, answerKey: { words: ['WORD1','WORD2'] }, explanation, topicTag }",
    "- ESSAY: { type: 'ESSAY', prompt, points: 2, options: null, answerKey: {}, explanation, topicTag }",
    "",
    `Requirements: Generate exactly ${safeCount} questions for subject=${input.subject}${input.level ? `, level=${input.level}` : ""}, using only types from [${typeList}]. For STEM/Math use LaTeX $...$. Keep academic accuracy high.`,
    "",
    "Source material:",
    input.sourceText.trim().slice(0, 12000),
  ].join("\n");
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(trimmed);
  return fenced ? fenced[1]!.trim() : trimmed;
}

/**
 * Parses and sanitizes raw Gemini text into validated Pivora Field drafts.
 * Drops malformed entries safely instead of throwing on minor model variance.
 */
export function parseAndSanitizeAiQuestions(rawText: string): AiGeneratedQuestionDraft[] {
  if (!rawText || typeof rawText !== "string") return [];
  let cleaned = stripJsonFence(rawText);

  // Fallback extraction if model wrapped JSON in explanatory text
  if (!cleaned.startsWith("[") && !cleaned.startsWith("{")) {
    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      cleaned = cleaned.slice(firstBracket, lastBracket + 1);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  const rawArray = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { questions?: unknown[] }).questions)
      ? (parsed as { questions: unknown[] }).questions
      : [];

  const out: AiGeneratedQuestionDraft[] = [];
  for (const item of rawArray) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const rawType = String(obj.type ?? "").toUpperCase();
    const prompt = typeof obj.prompt === "string" ? obj.prompt.trim().slice(0, 3000) : "";
    if (!prompt) continue;

    const rawPoints = Number(obj.points);
    const points = Number.isFinite(rawPoints)
      ? Math.max(0.25, Math.min(20, Math.round(rawPoints * 4) / 4))
      : 1;
    const explanation =
      typeof obj.explanation === "string" && obj.explanation.trim()
        ? obj.explanation.trim().slice(0, 2000)
        : null;
    const topicTag =
      typeof obj.topicTag === "string" && obj.topicTag.trim()
        ? obj.topicTag.trim().slice(0, 80)
        : null;

    if (rawType === "MULTIPLE_CHOICE") {
      if (!Array.isArray(obj.options) || obj.options.length < 2) continue;
      const opts = obj.options
        .map((o, idx) => {
          const r = o as Record<string, unknown>;
          const id =
            typeof r?.id === "string" && r.id.trim()
              ? r.id.trim().slice(0, 4).toUpperCase()
              : ["A", "B", "C", "D"][idx] || String(idx + 1);
          const text = typeof r?.text === "string" ? r.text.trim() : "";
          return text ? { id, text } : null;
        })
        .filter((x): x is { id: string; text: string } => Boolean(x))
        .slice(0, 8);
      if (opts.length < 2) continue;
      const ak = obj.answerKey as Record<string, unknown> | undefined;
      const rawCorrect = String(ak?.correct ?? opts[0]!.id).trim().toUpperCase();
      const correct = opts.some((o) => o.id === rawCorrect) ? rawCorrect : opts[0]!.id;
      out.push({
        type: "MULTIPLE_CHOICE",
        prompt,
        points,
        options: opts,
        answerKey: { correct },
        explanation,
        topicTag,
      });
    } else if (rawType === "TRUE_FALSE_GROUP") {
      if (!Array.isArray(obj.options) || obj.options.length < 2) continue;
      const opts = obj.options
        .map((o, idx) => {
          const r = o as Record<string, unknown>;
          const id =
            typeof r?.id === "string" && r.id.trim()
              ? r.id.trim().slice(0, 4).toLowerCase()
              : ["a", "b", "c", "d"][idx] || String(idx + 1);
          const text = typeof r?.text === "string" ? r.text.trim() : "";
          return text ? { id, text } : null;
        })
        .filter((x): x is { id: string; text: string } => Boolean(x))
        .slice(0, 6);
      if (opts.length < 2) continue;
      const ak = obj.answerKey as Record<string, unknown> | undefined;
      const rawCorrectMap =
        ak?.correct && typeof ak.correct === "object"
          ? (ak.correct as Record<string, unknown>)
          : {};
      const correctMap: Record<string, boolean> = {};
      for (const o of opts) {
        correctMap[o.id] = Boolean(rawCorrectMap[o.id]);
      }
      out.push({
        type: "TRUE_FALSE_GROUP",
        prompt,
        points,
        options: opts,
        answerKey: { correct: correctMap },
        explanation,
        topicTag,
      });
    } else if (rawType === "TEXT") {
      const ak = obj.answerKey as Record<string, unknown> | undefined;
      const accepted = Array.isArray(ak?.accepted)
        ? ak!.accepted.map((x) => String(x).trim()).filter(Boolean).slice(0, 10)
        : [];
      if (accepted.length === 0) continue;
      out.push({
        type: "TEXT",
        prompt,
        points,
        options: null,
        answerKey: { accepted },
        explanation,
        topicTag,
      });
    } else if (rawType === "WORDSEARCH") {
      const optObj = obj.options as Record<string, unknown> | undefined;
      const akObj = obj.answerKey as Record<string, unknown> | undefined;
      const wordsSource = Array.isArray(optObj?.words)
        ? optObj!.words
        : Array.isArray(akObj?.words)
          ? akObj!.words
          : [];
      const words = wordsSource
        .map((w) => String(w).trim().toUpperCase().replace(/[^A-Z]/g, ""))
        .filter((w) => w.length >= 2 && w.length <= 12)
        .slice(0, 8);
      if (words.length === 0) continue;
      const rows = Math.max(8, Math.min(15, Number(optObj?.rows) || 10));
      const cols = Math.max(8, Math.min(15, Number(optObj?.cols) || 10));
      const seed = words
        .join("|")
        .split("")
        .reduce((acc, ch, i) => (acc * 31 + ch.charCodeAt(0) * (i + 1)) >>> 0, 17);
      const grid = generateWordsearchGrid(words, rows, cols, seed);
      const placed = grid.placedWords.length > 0 ? grid.placedWords : words;
      out.push({
        type: "WORDSEARCH",
        prompt,
        points,
        options: {
          words: placed,
          rows,
          cols,
          grid: grid.grid,
          showWordList: optObj?.showWordList !== false,
        },
        answerKey: { words: placed },
        explanation,
        topicTag,
      });
    } else if (rawType === "ESSAY") {
      out.push({
        type: "ESSAY",
        prompt,
        points,
        options: null,
        answerKey: {},
        explanation,
        topicTag,
      });
    }
  }

  return out;
}
