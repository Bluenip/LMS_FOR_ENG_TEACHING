import { describe, expect, it } from "vitest";
import { computeScoreHistogram } from "@/lib/analytics/score-histogram";
import {
  CLASS_ROLE_RANK,
  canPerformClassAction,
  hasMinClassRole,
} from "@/lib/class-roles";

describe("Phase 20.1: computeScoreHistogram", () => {
  it("returns empty 10 buckets with zeros when input is empty", () => {
    const res = computeScoreHistogram([]);
    expect(res.count).toBe(0);
    expect(res.buckets).toHaveLength(10);
    expect(res.buckets[0]).toEqual({ index: 0, label: "0–1", min: 0, max: 1, count: 0, pct: 0 });
    expect(res.buckets[9]?.label).toBe("9–10");
    expect(res.median).toBe(0);
    expect(res.p90).toBe(0);
  });

  it("handles single score and boundary scores (0, 1, 9.99, 10)", () => {
    const single = computeScoreHistogram([7.5]);
    expect(single.count).toBe(1);
    expect(single.median).toBe(7.5);
    expect(single.p25).toBe(7.5);
    expect(single.buckets[7]?.count).toBe(1);
    expect(single.buckets[7]?.pct).toBe(100);

    const boundaries = computeScoreHistogram([0, 1, 9.99, 10]);
    expect(boundaries.buckets[0]?.count).toBe(1);
    expect(boundaries.buckets[1]?.count).toBe(1);
    expect(boundaries.buckets[9]?.count).toBe(2);
  });

  it("computes percentiles (p25, median, p75, p90) and mean accurately", () => {
    const res = computeScoreHistogram([2, 4, 6, 8, 10]);
    expect(res.mean).toBe(6);
    expect(res.median).toBe(6);
    expect(res.p25).toBe(4);
    expect(res.p75).toBe(8);
    expect(res.p90).toBe(9.2);
  });
});

describe("Phase 20.2: ClassRole permission matrix", () => {
  it("ranks OWNER > CO_TEACHER > ASSISTANT", () => {
    expect(CLASS_ROLE_RANK.OWNER).toBeGreaterThan(CLASS_ROLE_RANK.CO_TEACHER);
    expect(CLASS_ROLE_RANK.CO_TEACHER).toBeGreaterThan(CLASS_ROLE_RANK.ASSISTANT);
    expect(hasMinClassRole("OWNER", "ASSISTANT")).toBe(true);
    expect(hasMinClassRole("CO_TEACHER", "CO_TEACHER")).toBe(true);
    expect(hasMinClassRole("CO_TEACHER", "OWNER")).toBe(false);
    expect(hasMinClassRole("ASSISTANT", "CO_TEACHER")).toBe(false);
    expect(hasMinClassRole(null, "ASSISTANT")).toBe(false);
  });

  it("enforces fine-grained actions per ClassRole and Admin override", () => {
    expect(canPerformClassAction("OWNER", "DELETE_CLASS")).toBe(true);
    expect(canPerformClassAction("OWNER", "MANAGE_TEACHERS")).toBe(true);
    expect(canPerformClassAction("CO_TEACHER", "DELETE_CLASS")).toBe(false);
    expect(canPerformClassAction("CO_TEACHER", "ARCHIVE_CLASS")).toBe(false);
    expect(canPerformClassAction("CO_TEACHER", "MANAGE_TEACHERS")).toBe(false);
    expect(canPerformClassAction("CO_TEACHER", "EDIT_CLASS")).toBe(true);
    expect(canPerformClassAction("CO_TEACHER", "ASSIGN_WORK")).toBe(true);
    expect(canPerformClassAction("CO_TEACHER", "CLONE_CLASS")).toBe(true);
    expect(canPerformClassAction("ASSISTANT", "EDIT_CLASS")).toBe(false);
    expect(canPerformClassAction("ASSISTANT", "ASSIGN_WORK")).toBe(false);
    expect(canPerformClassAction("ASSISTANT", "GRADE")).toBe(true);
    expect(canPerformClassAction("ASSISTANT", "VIEW_REPORTS")).toBe(true);
    expect(canPerformClassAction("ASSISTANT", "LIVE_MONITOR")).toBe(true);
    expect(canPerformClassAction(null, "DELETE_CLASS", true)).toBe(true);
  });
});
