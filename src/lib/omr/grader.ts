import { gradeField, normalizeText } from "@/lib/grading";
import type { OmrResolvedAnswers, OmrTfAnswer } from "./bubble-reader";
import { getOmrTemplate, type OmrTemplateId } from "./templates";

export interface OmrVariantKey {
  mc?: Record<string, string>;
  tf?: Record<string, Record<string, boolean>>;
  sa?: Record<string, string>;
}

export type OmrAnswerKeyByVariant = Record<string, OmrVariantKey>;

export interface OmrPointsConfig {
  mcPoints: number;
  tfPoints: number;
  saPoints: number;
}

export interface OmrQuestionResult {
  /** "mc:3", "tf:1", "sa:2" */
  key: string;
  correct: boolean;
  points: number;
  maxPoints: number;
  /** TF only: statement letters answered correctly. */
  correctStatements?: string[];
}

export interface OmrGradeResult {
  score: number;
  maxScore: number;
  /** Variant actually used ("default" when the code is unknown or missing). */
  variantUsed: string | null;
  perQuestion: OmrQuestionResult[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Official THPT 2025 weights (3 + 4 + 3 = 10). Plain MC sheets split 10 points evenly over the questions
 * that actually have a key (`keyedMcCount`), falling back to the template size.
 */
export function defaultPointsConfig(templateId: OmrTemplateId, keyedMcCount?: number): OmrPointsConfig {
  if (templateId === "THPT_2025") return { mcPoints: 0.25, tfPoints: 1, saPoints: 0.5 };
  const n = keyedMcCount && keyedMcCount > 0 ? keyedMcCount : getOmrTemplate(templateId).mcCount;
  return { mcPoints: 10 / n, tfPoints: 0, saPoints: 0 };
}

export function pickVariantKey(
  keys: OmrAnswerKeyByVariant,
  variantCode: string | null | undefined
): { code: string; key: OmrVariantKey } | null {
  if (variantCode && keys[variantCode]) return { code: variantCode, key: keys[variantCode]! };
  if (keys.default) return { code: "default", key: keys.default };
  const codes = Object.keys(keys);
  // A single-variant exam does not need the code bubbled at all.
  if (codes.length === 1) return { code: codes[0]!, key: keys[codes[0]!]! };
  return null;
}

/** Short answers compare numerically when both sides are numbers ("1,5" == "1.50"), else as text. */
export function shortAnswerMatches(given: string | null | undefined, expected: string): boolean {
  if (!given) return false;
  const num = (s: string) => {
    const t = s.trim().replace(",", ".");
    return /^-?\d+(\.\d+)?$|^-?\.\d+$/.test(t) ? Number(t) : null;
  };
  const a = num(given);
  const b = num(expected);
  if (a !== null && b !== null) return Math.abs(a - b) < 1e-9;
  return normalizeText(given) === normalizeText(expected);
}

/**
 * Grades resolved bubble answers against the key of the detected exam code. Always run on the server:
 * client-side scores are never trusted.
 */
export function gradeOmrAnswers(
  templateId: OmrTemplateId,
  answers: Pick<OmrResolvedAnswers, "mc" | "tf" | "sa" | "variantCode">,
  keys: OmrAnswerKeyByVariant,
  points: OmrPointsConfig
): OmrGradeResult {
  const t = getOmrTemplate(templateId);
  const picked = pickVariantKey(keys, answers.variantCode);
  const key = picked?.key ?? {};
  const perQuestion: OmrQuestionResult[] = [];

  for (let q = 1; q <= t.mcCount; q++) {
    const expected = key.mc?.[String(q)];
    if (!expected) continue;
    const correct = answers.mc[String(q)] === expected;
    perQuestion.push({ key: `mc:${q}`, correct, points: correct ? points.mcPoints : 0, maxPoints: points.mcPoints });
  }

  for (let q = 1; q <= t.tfCount; q++) {
    const expected = key.tf?.[String(q)];
    if (!expected || Object.keys(expected).length === 0) continue;
    const given: OmrTfAnswer = answers.tf[String(q)] ?? {};
    // Reuse the THPT 2025 progressive scoring of TRUE_FALSE_GROUP (1/4→10%, 2/4→25%, 3/4→50%, 4/4→100%)
    const res = gradeField(
      { id: `tf${q}`, type: "TRUE_FALSE_GROUP", points: points.tfPoints, answerKey: { correct: expected }, gradingOpts: { tfScoring: "THPT_2025" } },
      Object.fromEntries(Object.keys(expected).map((st) => [st, given[st as "a"] ?? null]))
    );
    perQuestion.push({
      key: `tf:${q}`,
      correct: res.isCorrect === true,
      points: res.score ?? 0,
      maxPoints: points.tfPoints,
      correctStatements: Object.keys(expected).filter((st) => given[st as "a"] === expected[st]),
    });
  }

  for (let q = 1; q <= t.saCount; q++) {
    const expected = key.sa?.[String(q)];
    if (!expected) continue;
    const correct = shortAnswerMatches(answers.sa[String(q)], expected);
    perQuestion.push({ key: `sa:${q}`, correct, points: correct ? points.saPoints : 0, maxPoints: points.saPoints });
  }

  return {
    score: round2(perQuestion.reduce((s, r) => s + r.points, 0)),
    maxScore: round2(perQuestion.reduce((s, r) => s + r.maxPoints, 0)),
    variantUsed: picked?.code ?? null,
    perQuestion,
  };
}
