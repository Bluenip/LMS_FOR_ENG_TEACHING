import type { GradeResult, GradingOptions, OrderingAnswerKey } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Longest Common Subsequence length for two item-id arrays (used in ORDERING partial credit). */
export function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  const dp: number[] = Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    let prevDiag = 0;
    for (let j = 1; j <= n; j++) {
      const saved = dp[j]!;
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prevDiag + 1;
      } else {
        dp[j] = Math.max(dp[j]!, dp[j - 1]!);
      }
      prevDiag = saved;
    }
  }
  return dp[n]!;
}

export function gradeOrdering(
  answerKey: Partial<OrderingAnswerKey> | null | undefined,
  value: unknown,
  maxPoints: number,
  gradingOpts?: GradingOptions | null
): GradeResult {
  const expected = Array.isArray(answerKey?.order)
    ? answerKey.order.filter((s): s is string => typeof s === "string" && s.length > 0)
    : [];

  if (expected.length === 0) {
    return { isCorrect: false, score: 0 };
  }

  const student = Array.isArray(value)
    ? value.filter((s): s is string => typeof s === "string" && s.length > 0)
    : [];

  if (student.length === 0) {
    return { isCorrect: false, score: 0 };
  }

  const allCorrect =
    student.length === expected.length && expected.every((id, idx) => student[idx] === id);

  if (gradingOpts?.scoring === "ALL_OR_NOTHING") {
    return {
      isCorrect: allCorrect,
      score: allCorrect ? round2(maxPoints) : 0,
    };
  }

  if (gradingOpts?.orderingScoring === "EXACT_POS") {
    let exact = 0;
    for (let i = 0; i < expected.length; i++) {
      if (student[i] === expected[i]) exact++;
    }
    return {
      isCorrect: allCorrect,
      score: round2((maxPoints * exact) / expected.length),
    };
  }

  const lcs = lcsLength(student, expected);
  return {
    isCorrect: allCorrect,
    score: round2((maxPoints * lcs) / expected.length),
  };
}
