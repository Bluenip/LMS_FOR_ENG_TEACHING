export const VN_TZ_OFFSET_MINUTES = 420; // Asia/Ho_Chi_Minh (UTC+7)
const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

export interface ScheduleRuleInput {
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  active?: boolean;
}

export interface ExpandedOccurrence {
  startsAt: Date;
  endsAt: Date;
}

/** Parses `HH:MM` (00:00–23:59) into minutes since midnight, returning null if invalid. */
export function parseTimeToMinutes(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function toValidDate(input: Date | string | null | undefined): Date | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Expands a weekly recurrence rule into concrete UTC Date pairs `{ startsAt, endsAt }`,
 * anchored to `tzOffsetMinutes` (defaults to Asia/Ho_Chi_Minh UTC+7) so week-day
 * boundaries never drift near midnight UTC.
 */
export function expandScheduleOccurrences(
  rule: ScheduleRuleInput,
  rangeStartInput: Date | string,
  rangeEndInput: Date | string,
  opts?: { tzOffsetMinutes?: number; maxOccurrences?: number }
): ExpandedOccurrence[] {
  if (rule.active === false) return [];
  if (!Number.isInteger(rule.dayOfWeek) || rule.dayOfWeek < 0 || rule.dayOfWeek > 6) {
    return [];
  }

  const startMin = parseTimeToMinutes(rule.startTime);
  const endMin = parseTimeToMinutes(rule.endTime);
  if (startMin === null || endMin === null || endMin <= startMin) {
    return [];
  }

  const rangeStart = toValidDate(rangeStartInput);
  const rangeEnd = toValidDate(rangeEndInput);
  const effectiveFrom = toValidDate(rule.effectiveFrom);
  const effectiveTo = rule.effectiveTo ? toValidDate(rule.effectiveTo) : null;
  if (!rangeStart || !rangeEnd || !effectiveFrom) return [];

  const minTs = Math.max(rangeStart.getTime(), effectiveFrom.getTime());
  const maxTs = effectiveTo
    ? Math.min(rangeEnd.getTime(), effectiveTo.getTime())
    : rangeEnd.getTime();
  if (maxTs < minTs) return [];

  const tzOffsetMin = opts?.tzOffsetMinutes ?? VN_TZ_OFFSET_MINUTES;
  const tzOffsetMs = tzOffsetMin * MS_PER_MIN;
  const maxOccurrences = opts?.maxOccurrences ?? 120;

  // Iterate by local calendar day index starting from shifted `minTs` midnight UTC
  const shiftedStart = new Date(minTs + tzOffsetMs);
  const startDayUtcMs = Date.UTC(
    shiftedStart.getUTCFullYear(),
    shiftedStart.getUTCMonth(),
    shiftedStart.getUTCDate()
  );
  const shiftedEnd = new Date(maxTs + tzOffsetMs);
  const endDayUtcMs = Date.UTC(
    shiftedEnd.getUTCFullYear(),
    shiftedEnd.getUTCMonth(),
    shiftedEnd.getUTCDate()
  );

  // Align to the first matching weekday >= startDayUtcMs
  const firstDow = new Date(startDayUtcMs).getUTCDay();
  const deltaDays = (rule.dayOfWeek - firstDow + 7) % 7;

  const out: ExpandedOccurrence[] = [];
  for (
    let dayMs = startDayUtcMs + deltaDays * MS_PER_DAY;
    dayMs <= endDayUtcMs && out.length < maxOccurrences;
    dayMs += 7 * MS_PER_DAY
  ) {
    const startsAtMs = dayMs + startMin * MS_PER_MIN - tzOffsetMs;
    const endsAtMs = dayMs + endMin * MS_PER_MIN - tzOffsetMs;
    out.push({
      startsAt: new Date(startsAtMs),
      endsAt: new Date(endsAtMs),
    });
  }
  return out;
}

/** Returns UTC Date boundaries for a calendar month `(year, month 1..12)` in a given timezone offset. */
export function getMonthBoundariesUtc(
  year: number,
  month: number,
  tzOffsetMinutes = VN_TZ_OFFSET_MINUTES
): { start: Date; end: Date } {
  const offsetMs = tzOffsetMinutes * MS_PER_MIN;
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - offsetMs);
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - offsetMs - 1);
  return { start, end };
}
