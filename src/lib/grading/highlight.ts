import type {
  GradeResult,
  GradingOptions,
  HighlightAnswerKey,
} from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function gradeHighlight(
  answerKey: Partial<HighlightAnswerKey> | null | undefined,
  value: unknown,
  maxPoints: number,
  gradingOpts?: GradingOptions | null
): GradeResult {
  const expected = Array.isArray(answerKey?.indices)
    ? Array.from(
        new Set(
          answerKey.indices.filter((n): n is number => Number.isInteger(n) && n >= 0)
        )
      )
    : [];

  if (expected.length === 0) {
    return { isCorrect: false, score: 0 };
  }

  const picked = Array.isArray(value)
    ? Array.from(new Set(value.filter((n): n is number => Number.isInteger(n) && n >= 0)))
    : [];

  const expectedSet = new Set(expected);
  let tp = 0;
  let fp = 0;
  for (const idx of picked) {
    if (expectedSet.has(idx)) tp++;
    else fp++;
  }

  const allCorrect = tp === expected.length && fp === 0;
  if (gradingOpts?.scoring === "ALL_OR_NOTHING") {
    return {
      isCorrect: allCorrect,
      score: allCorrect ? round2(maxPoints) : 0,
    };
  }

  const netCorrect = Math.max(0, tp - fp);
  return {
    isCorrect: allCorrect,
    score: round2((maxPoints * netCorrect) / expected.length),
  };
}
