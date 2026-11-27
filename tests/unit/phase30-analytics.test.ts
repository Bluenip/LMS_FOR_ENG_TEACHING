import { describe, expect, it } from "vitest";
import { computeMasteryMatrix, masteryLevel, summarizeStudentMastery } from "@/lib/analytics/mastery";
import { detectAtRiskStudents } from "@/lib/analytics/at-risk";
import { analyzeItems, type ExamineeResponses } from "@/lib/analytics/item-analysis";

describe("Phase 30 Unit: mastery, at-risk & item analysis", () => {
  it("mastery levels and matrix (weakest topics first, NO_DATA when unseen)", () => {
    expect(masteryLevel(0.8, 1)).toBe("MASTERED");
    expect(masteryLevel(0.5, 1)).toBe("DEVELOPING");
    expect(masteryLevel(0.49, 1)).toBe("NEEDS_WORK");
    expect(masteryLevel(null, 0)).toBe("NO_DATA");

    const students = [
      { id: "s1", name: "An" },
      { id: "s2", name: "Bình" },
    ];
    const m = computeMasteryMatrix(students, [
      { studentId: "s1", tag: "Tenses", earned: 4, max: 4 },
      { studentId: "s1", tag: "Passive", earned: 1, max: 4 },
      { studentId: "s2", tag: "Tenses", earned: 3, max: 5 },
      { studentId: "s2", tag: "Tenses", earned: 9, max: 0 }, // ignored (max 0)
    ]);
    expect(m.tags.map((t) => t.tag)).toEqual(["Passive", "Tenses"]);
    expect(m.rows[0]!.cells.Tenses).toMatchObject({ accuracy: 1, level: "MASTERED", attemptsCount: 1 });
    expect(m.rows[0]!.cells.Passive!.level).toBe("NEEDS_WORK");
    expect(m.rows[1]!.cells.Tenses!.level).toBe("DEVELOPING");
    expect(m.rows[1]!.cells.Passive!.level).toBe("NO_DATA");
    const sum = summarizeStudentMastery(Object.values(m.rows[0]!.cells));
    expect(sum.strengths.map((c) => c.tag)).toEqual(["Tenses"]);
    expect(sum.toReview.map((c) => c.tag)).toEqual(["Passive"]);
  });

  it("at-risk: low scores, steady decline, missing work and absences → MEDIUM / HIGH", () => {
    const res = detectAtRiskStudents(
      [
        { student: { id: "a", name: "A" }, recentScores10: [8, 4, 3, 4], missingCount: 2, absentCount: 3 },
        { student: { id: "b", name: "B" }, recentScores10: [9, 8, 7], missingCount: 0, absentCount: null },
        { student: { id: "c", name: "C" }, recentScores10: [9, 8.5, 9], missingCount: 1, absentCount: 1 },
        { student: { id: "d", name: "D" }, recentScores10: [], missingCount: 3, absentCount: 0 },
      ],
      { scoreThreshold: 5, missingCount: 2 }
    );
    expect(res.map((r) => [r.student.id, r.level])).toEqual([
      ["a", "HIGH"],
      ["b", "MEDIUM"],
      ["d", "MEDIUM"],
    ]);
    expect(res[0]!.reasons.map((r) => r.signal)).toEqual(["LOW_SCORES", "MISSING_WORK", "ABSENCES"]);
    expect(res[1]!.reasons[0]!.signal).toBe("DECLINING");
    expect(res[1]!.reasons[0]!.en).toContain("9 → 7");
  });

  it("item analysis: difficulty, discrimination, point-biserial and CHECK_KEY when D < 0", () => {
    const items = [
      { fieldId: "q1", label: "1", type: "MULTIPLE_CHOICE", maxPoints: 1, options: [{ id: "A", text: "a" }, { id: "B", text: "b" }], correctOption: "A" },
      { fieldId: "q2", label: "2", type: "MULTIPLE_CHOICE", maxPoints: 1, options: [{ id: "A", text: "a" }, { id: "B", text: "b" }], correctOption: "A" },
      { fieldId: "q3", label: "3", type: "ESSAY", maxPoints: 4 },
    ];
    // 10 students: strong ones answer q1 right and q2 "wrong" (B) → q2's key is probably wrong
    const ex: ExamineeResponses[] = Array.from({ length: 10 }, (_, i) => {
      const strong = i < 5;
      return {
        submissionId: `s${i}`,
        responses: {
          q1: { score: strong ? 1 : 0, choice: strong ? "A" : "B" },
          q2: { score: strong ? 0 : 1, choice: strong ? "B" : "A" },
          q3: { score: strong ? 4 - (i % 2) : 1 },
        },
      };
    });
    const rows = analyzeItems(items, ex);
    const [r1, r2, r3] = rows;
    expect(r1!.pValue).toBe(0.5);
    expect(r1!.discriminationIndex).toBe(1);
    expect(r1!.flag).toBe("GOOD");
    expect(r1!.pointBiserial).toBeGreaterThan(0.8);
    expect(r1!.distractors.find((d) => d.optionId === "B")).toMatchObject({ upper: 0, lower: 1, isKey: false });
    expect(r2!.discriminationIndex).toBe(-1);
    expect(r2!.flag).toBe("CHECK_KEY");
    expect(r3!.n).toBe(10);

    // too few examinees → no discrimination, easy item flagged by difficulty only
    const few = analyzeItems([items[0]!], ex.slice(0, 3).map((e) => ({ ...e, responses: { q1: { score: 1, choice: "A" } } })));
    expect(few[0]).toMatchObject({ pValue: 1, discriminationIndex: null, flag: "TOO_EASY" });
  });
});
