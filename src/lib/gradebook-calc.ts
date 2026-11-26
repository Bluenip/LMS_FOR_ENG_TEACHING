export type GradebookScoreKind = "ONLINE" | "OFFLINE" | "ATTENDANCE";

export interface GradebookScoreItem {
  score: number;
  maxScore: number;
  weight: number;
  date?: Date | string | null;
  kind?: GradebookScoreKind;
}

export interface GradebookDateRange {
  from?: Date | string | null;
  to?: Date | string | null;
}

export interface AttendanceBonusInput {
  score: number;
  maxScore: number;
  weight: number;
}

/** Rounds a number to 2 decimal places. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Converts a raw score to a 0–10 scale, returning null on invalid inputs. */
export function normalizeToScale10(score: number, maxScore: number): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    return null;
  }
  const scaled = (score / maxScore) * 10;
  return round2(Math.max(0, Math.min(10, scaled)));
}

/**
 * Parses a date or `YYYY-MM-DD` string into an inclusive range boundary.
 * Date-only strings become 00:00:00.000Z when `endOfDay === false` or 23:59:59.999Z when `true`.
 */
export function parseDateBoundary(
  input: Date | string | null | undefined,
  endOfDay: boolean
): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
    const parsed = new Date(`${trimmed}${suffix}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Checks whether a date lies inside an optional inclusive `{ from, to }` range. */
export function isWithinDateRange(
  date: Date | string | null | undefined,
  range?: GradebookDateRange
): boolean {
  const fromBound = parseDateBoundary(range?.from, false);
  const toBound = parseDateBoundary(range?.to, true);
  if (!fromBound && !toBound) return true;
  if (!date) return false;
  const target = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(target.getTime())) return false;
  const ts = target.getTime();
  if (fromBound && ts < fromBound.getTime()) return false;
  if (toBound && ts > toBound.getTime()) return false;
  return true;
}

/**
 * Computes weighted average on a 0–10 scale:
 *   weightedAvg10 = sum((score / maxScore * 10) * weight) / sum(weight)
 * Filters items by optional `range` and optionally merges an attendance score (Phase 23 hook).
 */
export function computeWeightedAvg10(
  items: GradebookScoreItem[],
  opts?: {
    range?: GradebookDateRange;
    attendanceBonus?: AttendanceBonusInput | null;
  }
): number | null {
  const hasRange = Boolean(
    parseDateBoundary(opts?.range?.from, false) || parseDateBoundary(opts?.range?.to, true)
  );

  let weightedSum = 0;
  let totalWeight = 0;

  for (const item of items) {
    if (hasRange && !isWithinDateRange(item.date, opts?.range)) continue;
    if (
      !Number.isFinite(item.score) ||
      !Number.isFinite(item.maxScore) ||
      !Number.isFinite(item.weight) ||
      item.maxScore <= 0 ||
      item.weight <= 0
    ) {
      continue;
    }
    const scale10 = (item.score / item.maxScore) * 10;
    weightedSum += scale10 * item.weight;
    totalWeight += item.weight;
  }

  const att = opts?.attendanceBonus;
  if (
    att &&
    Number.isFinite(att.score) &&
    Number.isFinite(att.maxScore) &&
    Number.isFinite(att.weight) &&
    att.maxScore > 0 &&
    att.weight > 0
  ) {
    const scale10 = (att.score / att.maxScore) * 10;
    weightedSum += scale10 * att.weight;
    totalWeight += att.weight;
  }

  if (totalWeight <= 0) return null;
  return round2(weightedSum / totalWeight);
}

/** Computes integer percentage (0–100) for assignment submission rate. */
export function computeSubmissionRatePct(submitted: number, total: number): number {
  if (!Number.isFinite(submitted) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((submitted / total) * 100)));
}
