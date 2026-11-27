export type SrsQuality = 0 | 3 | 4 | 5; // 0: Lại, 3: Khó, 4: Tốt, 5: Dễ

export interface SrsState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

export interface NextSrsState extends SrsState {
  nextReviewAt: Date;
}

const MS_PER_DAY = 86_400_000;

/**
 * SuperMemo-2 spaced repetition algorithm:
 * - quality < 3: resets repetitions = 0, intervalDays = 1
 * - quality >= 3: rep 0 -> 1d, rep 1 -> 6d, rep >= 2 -> round(interval * EF)
 *   EF' = max(1.3, EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
 */
export function computeNextSrsState(
  prev: SrsState | null | undefined,
  quality: SrsQuality,
  now: Date = new Date()
): NextSrsState {
  const prevEF = prev?.easeFactor && Number.isFinite(prev.easeFactor) ? prev.easeFactor : 2.5;
  const prevInterval =
    prev?.intervalDays && Number.isFinite(prev.intervalDays) ? prev.intervalDays : 0;
  const prevReps = prev?.repetitions && Number.isFinite(prev.repetitions) ? prev.repetitions : 0;

  let repetitions: number;
  let intervalDays: number;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (prevReps === 0) intervalDays = 1;
    else if (prevReps === 1) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(prevInterval * prevEF));
    repetitions = prevReps + 1;
  }

  const diff = 5 - quality;
  const rawEF = prevEF + (0.1 - diff * (0.08 + diff * 0.02));
  const easeFactor = Math.round(Math.max(1.3, rawEF) * 100) / 100;

  const nextReviewAt = new Date(now.getTime() + intervalDays * MS_PER_DAY);
  return { easeFactor, intervalDays, repetitions, nextReviewAt };
}
