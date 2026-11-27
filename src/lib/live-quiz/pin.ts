import type { LiveQuizPlayerQuestion, LiveQuizSnapshotQuestion } from "./types";

export const LIVE_QUIZ_PIN_REGEX = /^\d{6}$/;

/** Random 6-digit PIN in 100000..999999. */
export function randomLiveQuizPin(random: () => number = Math.random): string {
  return String(100000 + Math.floor(random() * 900000));
}

/**
 * Generates a PIN that is not used by any other `LiveQuizSession` (the column is `@unique`).
 * `exists` is injected so this module stays free of database imports.
 */
export async function generateLiveQuizPin(
  exists: (pin: string) => Promise<boolean>,
  opts: { random?: () => number; maxAttempts?: number } = {}
): Promise<string> {
  const maxAttempts = opts.maxAttempts ?? 25;
  for (let i = 0; i < maxAttempts; i++) {
    const pin = randomLiveQuizPin(opts.random);
    if (!(await exists(pin))) return pin;
  }
  throw new Error("LIVE_QUIZ_PIN_EXHAUSTED");
}

/** Strips everything a player must not see (answer key, grading options). */
export function sanitizeLiveQuestionForPlayer(q: LiveQuizSnapshotQuestion): LiveQuizPlayerQuestion {
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: Array.isArray(q.options) ? q.options.map((o) => ({ id: o.id, text: o.text })) : null,
    imageKey: q.imageKey ?? null,
    timeLimitSec: q.timeLimitSec,
  };
}
