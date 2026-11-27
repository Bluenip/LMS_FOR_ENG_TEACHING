export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Kahoot-style points: 0 when wrong; otherwise 500 base + up to 500 speed bonus
 * plus a streak bonus of 50 per consecutive correct answer (capped at 5).
 * `streak` is the number of consecutive correct answers *before* this one.
 */
export function computeLiveQuizPoints(input: {
  isCorrect: boolean;
  responseMs: number;
  limitMs: number;
  streak: number;
}): number {
  if (!input.isCorrect) return 0;
  const limitMs = input.limitMs > 0 ? input.limitMs : 1;
  const speed = clamp(1 - Math.max(0, input.responseMs) / limitMs, 0, 1);
  const streak = Math.max(0, Math.floor(input.streak));
  return Math.round(500 + 500 * speed) + Math.min(streak, 5) * 50;
}

/** Correct-answer ratio converted to a gradebook score on a `maxScore` scale (2 decimals). */
export function liveQuizRatioToScore(correct: number, total: number, maxScore: number): number {
  if (total <= 0 || maxScore <= 0) return 0;
  const ratio = clamp(correct / total, 0, 1);
  return Math.round(ratio * maxScore * 100) / 100;
}
