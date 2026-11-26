import { describe, expect, it } from "vitest";
import {
  computeSubmissionRatePct,
  computeWeightedAvg10,
  isWithinDateRange,
  normalizeToScale10,
  parseDateBoundary,
} from "@/lib/gradebook-calc";

describe("Phase 21: gradebook-calc pure library", () => {
  it("normalizes scores across arbitrary maxScores cleanly and clamps 0..10", () => {
    expect(normalizeToScale10(8, 10)).toBe(8);
    expect(normalizeToScale10(15, 20)).toBe(7.5);
    expect(normalizeToScale10(17, 25)).toBe(6.8);
    expect(normalizeToScale10(12, 10)).toBe(10);
    expect(normalizeToScale10(-2, 10)).toBe(0);
    expect(normalizeToScale10(5, 0)).toBeNull();
    expect(normalizeToScale10(Number.NaN, 10)).toBeNull();
  });

  it("parses inclusive date boundaries and filters items accurately", () => {
    const start = parseDateBoundary("2026-11-01", false);
    const end = parseDateBoundary("2026-11-15", true);
    expect(start?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(end?.toISOString()).toBe("2026-11-15T23:59:59.999Z");

    expect(
      isWithinDateRange("2026-11-01T00:00:00.000Z", { from: "2026-11-01", to: "2026-11-15" })
    ).toBe(true);
    expect(
      isWithinDateRange("2026-11-15T23:00:00.000Z", { from: "2026-11-01", to: "2026-11-15" })
    ).toBe(true);
    expect(
      isWithinDateRange("2026-10-31T23:59:59.000Z", { from: "2026-11-01", to: "2026-11-15" })
    ).toBe(false);
    expect(isWithinDateRange(null, { from: "2026-11-01" })).toBe(false);
    expect(isWithinDateRange(null, undefined)).toBe(true);
  });

  it("computes weighted average mixing online, offline scales, date filtering & attendance bonus", () => {
    const avg = computeWeightedAvg10([
      { score: 16, maxScore: 20, weight: 1, date: "2026-11-05", kind: "ONLINE" }, // 8.0 * 1
      { score: 9, maxScore: 10, weight: 2, date: "2026-11-10", kind: "OFFLINE" }, // 9.0 * 2
      { score: 5, maxScore: 10, weight: 0, date: "2026-11-12", kind: "OFFLINE" }, // ignored (weight 0)
    ]);
    // (8*1 + 9*2) / (1 + 2) = 26 / 3 = 8.67
    expect(avg).toBe(8.67);

    // Date filtered average
    const filteredAvg = computeWeightedAvg10(
      [
        { score: 6, maxScore: 10, weight: 1, date: "2026-10-20" },
        { score: 9, maxScore: 10, weight: 1, date: "2026-11-10" },
      ],
      { range: { from: "2026-11-01", to: "2026-11-30" } }
    );
    expect(filteredAvg).toBe(9);

    // With Phase 23 attendance bonus hook
    const withAtt = computeWeightedAvg10(
      [{ score: 8, maxScore: 10, weight: 2 }],
      { attendanceBonus: { score: 10, maxScore: 10, weight: 1 } }
    );
    expect(withAtt).toBe(8.67);

    expect(computeWeightedAvg10([])).toBeNull();
  });

  it("computes submission rate percentages safely", () => {
    expect(computeSubmissionRatePct(0, 0)).toBe(0);
    expect(computeSubmissionRatePct(3, 4)).toBe(75);
    expect(computeSubmissionRatePct(5, 4)).toBe(100);
  });
});
