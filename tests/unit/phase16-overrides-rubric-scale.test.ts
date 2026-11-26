import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveEffectiveAssignment } from "@/lib/assignment-effective";
import { computeRubricTotal } from "@/lib/grading";
import { convertScoreToScale, scoreScaleLabel } from "@/lib/score-scale";
import {
  clearOfflineDraft,
  loadFlaggedFieldIds,
  loadOfflineDraft,
  saveFlaggedFieldIds,
  saveOfflineDraft,
} from "@/lib/offline-answer-queue";

describe("Phase 16: resolveEffectiveAssignment", () => {
  const baseDue = new Date("2026-12-01T12:00:00.000Z");

  it("returns base assignment settings with hasOverride=false when override is missing or neutral", () => {
    const base = { dueAt: baseDue, timeLimitMin: 45, maxAttempts: 2 };
    expect(resolveEffectiveAssignment(base, null)).toEqual({
      dueAt: baseDue,
      timeLimitMin: 45,
      maxAttempts: 2,
      hasOverride: false,
    });
    expect(
      resolveEffectiveAssignment(base, { extraAttempts: 0, dueAt: null, timeLimitMin: null })
    ).toEqual({
      dueAt: baseDue,
      timeLimitMin: 45,
      maxAttempts: 2,
      hasOverride: false,
    });
  });

  it("applies extraAttempts, custom dueAt, and custom timeLimitMin when present", () => {
    const extDue = new Date("2026-12-03T12:00:00.000Z");
    const effective = resolveEffectiveAssignment(
      { dueAt: baseDue, timeLimitMin: 45, maxAttempts: 1 },
      { extraAttempts: 2, dueAt: extDue, timeLimitMin: 75 }
    );
    expect(effective).toEqual({
      dueAt: extDue,
      timeLimitMin: 75,
      maxAttempts: 3,
      hasOverride: true,
    });
  });

  it("preserves unlimited attempts (maxAttempts: null) even when extraAttempts > 0", () => {
    const effective = resolveEffectiveAssignment(
      { dueAt: null, timeLimitMin: null, maxAttempts: null },
      { extraAttempts: 3, dueAt: null, timeLimitMin: 60 }
    );
    expect(effective.maxAttempts).toBeNull();
    expect(effective.timeLimitMin).toBe(60);
    expect(effective.hasOverride).toBe(true);
  });
});

describe("Phase 16: computeRubricTotal", () => {
  const rubric = [
    { id: "c1", title: "Content", maxPoints: 1.0 },
    { id: "c2", title: "Grammar", maxPoints: 0.5 },
    { id: "c3", title: "Vocab", maxPoints: 0.5 },
  ];

  it("sums criterion scores and clamps each criterion between 0 and maxPoints", () => {
    const result = computeRubricTotal(
      rubric,
      { c1: 0.75, c2: 0.9, c3: -0.5, unknown: 99 },
      2
    );
    expect(result.clampedScores).toEqual({ c1: 0.75, c2: 0.5, c3: 0 });
    expect(result.total).toBe(1.25);
  });

  it("caps total score at fieldMaxPoints even if criteria sum exceeds fieldMaxPoints", () => {
    const result = computeRubricTotal(rubric, { c1: 1, c2: 0.5, c3: 0.5 }, 1.5);
    expect(result.total).toBe(1.5);
  });
});

describe("Phase 16: convertScoreToScale", () => {
  it("converts to SCALE_10 correctly", () => {
    const res = convertScoreToScale(8.5, 10, "SCALE_10");
    expect(res).toEqual({
      scale: "SCALE_10",
      value: 8.5,
      max: 10,
      formatted: "8.5/10",
      shortLabel: "8.5",
    });
  });

  it("converts to SCALE_100 correctly", () => {
    const res = convertScoreToScale(15, 20, "SCALE_100");
    expect(res).toEqual({
      scale: "SCALE_100",
      value: 75,
      max: 100,
      formatted: "75/100",
      shortLabel: "75",
    });
  });

  it("converts to IELTS bands including zero and threshold cases", () => {
    expect(convertScoreToScale(0, 40, "IELTS").formatted).toBe("Band 0.0");
    expect(convertScoreToScale(2, 40, "IELTS").value).toBe(2.5);
    expect(convertScoreToScale(26, 40, "IELTS").value).toBe(7.0);
    expect(convertScoreToScale(38, 40, "IELTS")).toEqual({
      scale: "IELTS",
      value: 9.0,
      max: 9,
      formatted: "Band 9.0",
      shortLabel: "9.0",
    });
  });

  it("converts to RAW and handles maxScore === 0 safely", () => {
    expect(convertScoreToScale(7.5, 12, "RAW")).toEqual({
      scale: "RAW",
      value: 7.5,
      max: 12,
      formatted: "7.5/12",
      shortLabel: "7.5",
    });
    expect(convertScoreToScale(0, 0, "SCALE_100").value).toBe(0);
    expect(scoreScaleLabel("IELTS", (vi) => vi)).toContain("IELTS");
  });
});

describe("Phase 16: offline-answer-queue localStorage persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves, loads matching attemptVersion, rejects stale version, and clears drafts + flags", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });

    saveOfflineDraft("sub-1", 3, { f1: "hello", f2: true });
    const loaded = loadOfflineDraft("sub-1", 3);
    expect(loaded?.answers).toEqual({ f1: "hello", f2: true });
    expect(loadOfflineDraft("sub-1", 4)).toBeNull();

    clearOfflineDraft("sub-1");
    expect(loadOfflineDraft("sub-1", 3)).toBeNull();

    saveFlaggedFieldIds("sub-1", ["f2", "f1", "f2"]);
    expect(loadFlaggedFieldIds("sub-1")).toEqual(["f2", "f1"]);
  });
});
