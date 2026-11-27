import { describe, expect, it } from "vitest";
import {
  countAvailableForMatrixRow,
  matchesMatrixRow,
  pickQuestionsByMatrix,
  type PoolQuestion,
} from "@/lib/exam/matrix-picker";
import { buildExamVariants } from "@/lib/exam/variant-generator";

function makePool(): PoolQuestion[] {
  return [
    { id: "q1", subject: "ENGLISH", type: "MULTIPLE_CHOICE", topicTag: "Ngữ pháp", skillTag: "GRAMMAR", level: "B1", difficulty: 1, tags: ["thpt"] },
    { id: "q2", subject: "ENGLISH", type: "MULTIPLE_CHOICE", topicTag: "Ngữ pháp", skillTag: "GRAMMAR", level: "B2", difficulty: 3, tags: ["thpt"] },
    { id: "q3", subject: "ENGLISH", type: "MULTIPLE_CHOICE", topicTag: "Từ vựng", skillTag: "VOCABULARY", level: "B1", difficulty: 2, tags: ["thpt"] },
    { id: "q4", subject: "ENGLISH", type: "TEXT", topicTag: "Từ vựng", skillTag: "VOCABULARY", level: "B2", difficulty: 4, tags: ["thpt"] },
    { id: "q5", subject: "MATH", type: "NUMBER", topicTag: "Đại số", skillTag: null, level: "THPT", difficulty: 3, tags: ["toan12"] },
  ];
}

describe("Phase 22: matrix-picker & variant-generator pure libs", () => {
  it("matches matrix filters case-insensitively and counts availability", () => {
    const pool = makePool();
    expect(matchesMatrixRow(pool[0]!, { subject: "ENGLISH", topicTag: "ngữ pháp", count: 1 })).toBe(true);
    expect(matchesMatrixRow(pool[0]!, { subject: "ENGLISH", difficultyMin: 2, count: 1 })).toBe(false);
    expect(countAvailableForMatrixRow(pool, { subject: "ENGLISH", type: "MULTIPLE_CHOICE", count: 1 })).toBe(3);
  });

  it("picks narrowest rows first so overlapping broad rows never starve strict constraints", () => {
    const pool = makePool();
    // Row 0 is broad (any ENGLISH MC -> 3 items: q1, q2, q3)
    // Row 1 is strict (topicTag=Từ vựng & ENGLISH MC -> 1 item: q3 only!)
    // Narrow-first assigns q3 to Row 1 first, leaving q1 & q2 for Row 0 without duplicate or false shortage.
    const result = pickQuestionsByMatrix(pool, [
      { subject: "ENGLISH", type: "MULTIPLE_CHOICE", count: 2, points: 1 },
      { subject: "ENGLISH", type: "MULTIPLE_CHOICE", topicTag: "Từ vựng", count: 1, points: 2 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.picked).toHaveLength(3);
    const ids = new Set(result.picked.map((p) => p.item.id));
    expect(ids.size).toBe(3);
    const row1Pick = result.picked.find((p) => p.rowIndex === 1);
    expect(row1Pick?.item.id).toBe("q3");
    expect(row1Pick?.points).toBe(2);
  });

  it("returns detailed shortages when bank lacks questions", () => {
    const pool = makePool();
    const res = pickQuestionsByMatrix(pool, [
      { subject: "ENGLISH", topicTag: "Ngữ pháp", count: 5 },
    ]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.shortages).toEqual([
      { rowIndex: 0, requested: 5, available: 2, availableUnique: 2 },
    ]);
  });

  it("builds N exam variants with codes 101..104 preserving fields & options", () => {
    const fields = [
      { id: "ov1", placement: "OVERLAY" as const, type: "TEXT" as const },
      {
        id: "f1",
        placement: "ANSWER_SHEET" as const,
        type: "MULTIPLE_CHOICE" as const,
        options: [
          { id: "A", text: "1" },
          { id: "B", text: "2" },
          { id: "C", text: "3" },
          { id: "D", text: "4" },
        ],
      },
      {
        id: "f2",
        placement: "ANSWER_SHEET" as const,
        type: "MULTI_SELECT" as const,
        options: [
          { id: "A", text: "x" },
          { id: "B", text: "y" },
          { id: "C", text: "z" },
        ],
      },
      { id: "f3", placement: "ANSWER_SHEET" as const, type: "TEXT" as const },
    ];

    const variants = buildExamVariants(fields, 4, 101);
    expect(variants.map((v) => v.code)).toEqual(["101", "102", "103", "104"]);
    for (const v of variants) {
      expect(v.questionOrder).toHaveLength(3);
      expect(new Set(v.questionOrder)).toEqual(new Set(["f1", "f2", "f3"]));
      expect(v.questionOrder).not.toContain("ov1");
      expect(new Set(v.optionOrder["f1"])).toEqual(new Set(["A", "B", "C", "D"]));
      expect(new Set(v.optionOrder["f2"])).toEqual(new Set(["A", "B", "C"]));
    }
  });
});
