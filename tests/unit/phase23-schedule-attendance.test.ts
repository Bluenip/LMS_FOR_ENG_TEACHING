import { describe, expect, it } from "vitest";
import {
  expandScheduleOccurrences,
  getMonthBoundariesUtc,
  parseTimeToMinutes,
} from "@/lib/schedule/recurrence";
import { computeAttendanceSummary } from "@/lib/attendance-calc";

describe("Phase 23 pure schedule recurrence & attendance helpers", () => {
  it("parses HH:MM strings accurately and rejects malformed values", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("19:30")).toBe(19 * 60 + 30);
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("09:99")).toBeNull();
    expect(parseTimeToMinutes("invalid")).toBeNull();
  });

  it("expands weekly Monday occurrences in UTC+7 timezone without weekday drift", () => {
    // 2026-11-23 is Monday in Asia/Ho_Chi_Minh; test boundary near midnight
    const from = new Date("2026-11-23T00:00:00+07:00");
    const to = new Date("2026-12-14T23:59:59+07:00");
    const occs = expandScheduleOccurrences(
      {
        dayOfWeek: 1, // Monday
        startTime: "07:00",
        endTime: "08:30",
        effectiveFrom: from,
        effectiveTo: to,
      },
      from,
      to
    );

    // 4 Mondays: Nov 23, Nov 30, Dec 7, Dec 14
    expect(occs).toHaveLength(4);
    expect(occs[0]!.startsAt.toISOString()).toBe("2026-11-23T00:00:00.000Z"); // 07:00+07:00
    expect(occs[0]!.endsAt.toISOString()).toBe("2026-11-23T01:30:00.000Z");
    expect(occs[3]!.startsAt.toISOString()).toBe("2026-12-14T00:00:00.000Z");
  });

  it("returns empty array when rule is inactive or endTime <= startTime", () => {
    const from = new Date("2026-11-01T00:00:00+07:00");
    const to = new Date("2026-11-30T23:59:59+07:00");
    expect(
      expandScheduleOccurrences(
        { dayOfWeek: 2, startTime: "19:00", endTime: "20:00", effectiveFrom: from, active: false },
        from,
        to
      )
    ).toEqual([]);
    expect(
      expandScheduleOccurrences(
        { dayOfWeek: 2, startTime: "20:00", endTime: "19:00", effectiveFrom: from },
        from,
        to
      )
    ).toEqual([]);
  });

  it("computes UTC+7 monthly boundaries accurately", () => {
    const { start, end } = getMonthBoundariesUtc(2026, 11);
    expect(start.toISOString()).toBe("2026-10-31T17:00:00.000Z"); // 2026-11-01 00:00+07
    expect(end.toISOString()).toBe("2026-11-30T16:59:59.999Z"); // 2026-11-30 23:59:59.999+07
  });

  it("computes weighted attendance rate accurately (PRESENT=1, LATE=0.8, EXCUSED=0.5, ABSENT=0)", () => {
    expect(computeAttendanceSummary([]).attendanceRatePct).toBeNull();
    const res = computeAttendanceSummary(["PRESENT", "LATE", "EXCUSED", "ABSENT"]);
    // (1 + 0.8 + 0.5 + 0) / 4 = 2.3 / 4 = 57.5%
    expect(res).toEqual({
      presentCount: 1,
      lateCount: 1,
      excusedCount: 1,
      absentCount: 1,
      totalMarked: 4,
      attendanceRatePct: 57.5,
    });
  });
});
