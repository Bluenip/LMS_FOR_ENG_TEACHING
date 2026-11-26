export interface ScoreHistogramBucket {
  index: number;
  label: string;
  min: number;
  max: number;
  count: number;
  pct: number;
}

export interface ScoreHistogramResult {
  buckets: ScoreHistogramBucket[];
  count: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  p90: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return round2(sorted[0]!);
  const pos = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const weight = pos - lo;
  const loVal = sorted[lo] ?? 0;
  const hiVal = sorted[hi] ?? loVal;
  return round2(loVal + (hiVal - loVal) * weight);
}

/**
 * Computes a 10-bucket histogram [0-1, 1-2, ..., 9-10] and percentiles on 10-point scores.
 */
export function computeScoreHistogram(scores10: number[]): ScoreHistogramResult {
  const valid = scores10.filter((n) => typeof n === "number" && Number.isFinite(n));
  const counts = new Array<number>(10).fill(0);

  for (const raw of valid) {
    const clamped = Math.min(10, Math.max(0, raw));
    const idx = Math.min(9, Math.max(0, Math.floor(clamped)));
    counts[idx] = (counts[idx] ?? 0) + 1;
  }

  const total = valid.length;
  const buckets: ScoreHistogramBucket[] = counts.map((count, index) => ({
    index,
    label: `${index}–${index + 1}`,
    min: index,
    max: index + 1,
    count,
    pct: total > 0 ? round2((count / total) * 100) : 0,
  }));

  if (total === 0) {
    return {
      buckets,
      count: 0,
      mean: 0,
      median: 0,
      p25: 0,
      p75: 0,
      p90: 0,
    };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);

  return {
    buckets,
    count: total,
    mean: round2(sum / total),
    median: computePercentile(sorted, 50),
    p25: computePercentile(sorted, 25),
    p75: computePercentile(sorted, 75),
    p90: computePercentile(sorted, 90),
  };
}
