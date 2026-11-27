const VN_OFFSET_MS = 7 * 3_600_000;

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
}

/** Converts a Date to `YYYY-MM-DD` in Asia/Ho_Chi_Minh (UTC+7). */
export function getVnDayKey(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + VN_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayKeyToEpochDays(dayKey: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.floor(utc / 86_400_000);
}

/**
 * Pure streak transition rule for a VN calendar day (`YYYY-MM-DD`):
 * - same day -> unchanged
 * - previous day (diff === 1) -> currentStreak + 1
 * - gap > 1 or first activity -> currentStreak = 1
 */
export function advanceStreak(
  prev: StreakState | null | undefined,
  activityDayVN: string
): StreakState {
  const prevCur = prev?.currentStreak ?? 0;
  const prevLong = prev?.longestStreak ?? 0;
  const prevDay = prev?.lastActivityDate ?? null;

  if (!prevDay) {
    return {
      currentStreak: 1,
      longestStreak: Math.max(1, prevLong),
      lastActivityDate: activityDayVN,
    };
  }

  if (prevDay === activityDayVN) {
    return {
      currentStreak: Math.max(1, prevCur),
      longestStreak: Math.max(prevLong, Math.max(1, prevCur)),
      lastActivityDate: activityDayVN,
    };
  }

  const prevEpoch = dayKeyToEpochDays(prevDay);
  const curEpoch = dayKeyToEpochDays(activityDayVN);
  if (prevEpoch !== null && curEpoch !== null && curEpoch - prevEpoch === 1) {
    const nextCur = prevCur + 1;
    return {
      currentStreak: nextCur,
      longestStreak: Math.max(prevLong, nextCur),
      lastActivityDate: activityDayVN,
    };
  }

  if (prevEpoch !== null && curEpoch !== null && curEpoch < prevEpoch) {
    // Out-of-order past event must not shrink current streak
    return {
      currentStreak: prevCur,
      longestStreak: prevLong,
      lastActivityDate: prevDay,
    };
  }

  return {
    currentStreak: 1,
    longestStreak: Math.max(1, prevLong),
    lastActivityDate: activityDayVN,
  };
}

/** Returns ISO-like VN week key e.g. `2026-W48` for WeeklyReportSent deduplication. */
export function getVnWeekKey(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + VN_OFFSET_MS);
  const target = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  );
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
