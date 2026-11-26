import type {
  GradingOptions,
  MatchAnswerKey,
  MatchAnswerValue,
  GradeResult,
} from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function gradeMatch(
  answerKey: Partial<MatchAnswerKey> | null | undefined,
  value: unknown,
  maxPoints: number,
  gradingOpts?: GradingOptions | null
): GradeResult {
  const pairs = Array.isArray(answerKey?.pairs)
    ? answerKey.pairs.filter(
        (p): p is [string, string] =>
          Array.isArray(p) &&
          p.length === 2 &&
          typeof p[0] === "string" &&
          typeof p[1] === "string" &&
          p[0].length > 0 &&
          p[1].length > 0
      )
    : [];

  if (pairs.length === 0) {
    return { isCorrect: false, score: 0 };
  }

  const student =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as MatchAnswerValue)
      : {};

  let matched = 0;
  for (const [leftId, rightId] of pairs) {
    if (typeof student[leftId] === "string" && student[leftId] === rightId) {
      matched++;
    }
  }

  const allCorrect = matched === pairs.length;
  if (gradingOpts?.scoring === "ALL_OR_NOTHING") {
    return {
      isCorrect: allCorrect,
      score: allCorrect ? round2(maxPoints) : 0,
    };
  }

  return {
    isCorrect: allCorrect,
    score: round2((maxPoints * matched) / pairs.length),
  };
}
