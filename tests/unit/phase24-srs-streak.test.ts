import { describe, expect, it } from "vitest";
import { computeNextSrsState } from "@/lib/srs";
import { advanceStreak, getVnDayKey, getVnWeekKey } from "@/lib/streak";

describe("Phase 24 pure SM-2 SRS & VN Streak helpers", () => {
  it("computes SM-2 intervals accurately across repetitions and resets on quality 0", () => {
    const now = new Date("2026-11-27T02:00:00.000Z");

    // Rep 0 -> Good (4) => 1 day
    const s1 = computeNextSrsState(null, 4, now);
    expect(s1.repetitions).toBe(1);
    expect(s1.intervalDays).toBe(1);
    expect(s1.easeFactor).toBe(2.5);
    expect(s1.nextReviewAt.toISOString()).toBe("2026-11-28T02:00:00.000Z");

    // Rep 1 -> Good (4) => 6 days
    const s2 = computeNextSrsState(s1, 4, now);
    expect(s2.repetitions).toBe(2);
    expect(s2.intervalDays).toBe(6);

    // Rep 2 -> Easy (5) => round(6 * 2.5) = 15 days, EF increases
    const s3 = computeNextSrsState(s2, 5, now);
    expect(s3.repetitions).toBe(3);
    expect(s3.intervalDays).toBe(15);
    expect(s3.easeFactor).toBe(2.6);

    // Quality 0 (Again) resets repetitions=0, interval=1, reduces EF (clamped >= 1.3)
    const reset = computeNextSrsState({ easeFactor: 1.3, intervalDays: 10, repetitions: 4 }, 0, now);
    expect(reset.repetitions).toBe(0);
    expect(reset.intervalDays).toBe(1);
    expect(reset.easeFactor).toBe(1.3);
  });

  it("advances student streak cleanly across consecutive, same, gap, and out-of-order days", () => {
    const first = advanceStreak(null, "2026-11-25");
    expect(first).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      lastActivityDate: "2026-11-25",
    });

    const same = advanceStreak(first, "2026-11-25");
    expect(same.currentStreak).toBe(1);

    const next = advanceStreak(same, "2026-11-26");
    expect(next).toEqual({
      currentStreak: 2,
      longestStreak: 2,
      lastActivityDate: "2026-11-26",
    });

    // Out-of-order older date preserves streak
    const past = advanceStreak(next, "2026-11-20");
    expect(past).toEqual(next);

    // Gap > 1 day resets currentStreak to 1 while retaining longestStreak
    const gap = advanceStreak(next, "2026-11-29");
    expect(gap).toEqual({
      currentStreak: 1,
      longestStreak: 2,
      lastActivityDate: "2026-11-29",
    });
  });

  it("formats VN calendar day and week keys accurately", () => {
    // 2026-11-27 22:00 UTC is 2026-11-28 05:00 in Asia/Ho_Chi_Minh
    expect(getVnDayKey(new Date("2026-11-27T22:00:00.000Z"))).toBe("2026-11-28");
    expect(getVnWeekKey(new Date("2026-11-27T02:00:00.000Z"))).toMatch(/^\d{4}-W\d{2}$/);
  });
});
