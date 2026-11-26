import { describe, expect, it } from "vitest";
import { gradeField, gradeSubmission } from "@/lib/grading";
import { isAnswerFilled } from "@/components/worksheet/types";
import { getSubjectMeta, getSubjectProfile, WORKSHEET_SUBJECTS } from "@/lib/subjects";
import { tokenizeMathText } from "@/components/worksheet/MathText";

describe("TRUE_FALSE_GROUP grading (THPT 2025 & modes)", () => {
  const baseField = {
    id: "tfg-1",
    type: "TRUE_FALSE_GROUP" as const,
    points: 1,
    answerKey: { correct: { a: true, b: false, c: true, d: false } },
  };

  it("applies official THPT 2025 progressive scoring by default (only 4/4 earns full 1.0)", () => {
    // 0/4 -> 0
    expect(gradeField(baseField, { a: false, b: true, c: false, d: true })).toEqual({
      isCorrect: false,
      score: 0,
    });
    // Blank / unanswered -> 0
    expect(gradeField(baseField, null)).toEqual({ isCorrect: false, score: 0 });
    // 1/4 -> 10% (0.1)
    expect(gradeField(baseField, { a: true, b: true, c: false, d: true })).toEqual({
      isCorrect: false,
      score: 0.1,
    });
    // 2/4 -> 25% (0.25)
    expect(gradeField(baseField, { a: true, b: false, c: false, d: true })).toEqual({
      isCorrect: false,
      score: 0.25,
    });
    // 3/4 -> 50% (0.5)
    expect(gradeField(baseField, { a: true, b: false, c: true, d: true })).toEqual({
      isCorrect: false,
      score: 0.5,
    });
    // 4/4 -> 100% (1.0)
    expect(gradeField(baseField, { a: true, b: false, c: true, d: false })).toEqual({
      isCorrect: true,
      score: 1,
    });
  });

  it("scales THPT 2025 scoring proportionally for custom max points", () => {
    const field2pt = { ...baseField, points: 2 };
    expect(gradeField(field2pt, { a: true })).toEqual({ isCorrect: false, score: 0.2 });
    expect(gradeField(field2pt, { a: true, b: false })).toEqual({ isCorrect: false, score: 0.5 });
    expect(gradeField(field2pt, { a: true, b: false, c: true })).toEqual({
      isCorrect: false,
      score: 1,
    });
    expect(gradeField(field2pt, { a: true, b: false, c: true, d: false })).toEqual({
      isCorrect: true,
      score: 2,
    });
  });

  it("supports ALL_OR_NOTHING (must get all 4 right for full point) and EQUAL scoring", () => {
    const allOrNothing = { ...baseField, gradingOpts: { tfScoring: "ALL_OR_NOTHING" as const } };
    expect(gradeField(allOrNothing, { a: true, b: false, c: true })).toEqual({
      isCorrect: false,
      score: 0,
    });
    expect(gradeField(allOrNothing, { a: true, b: false, c: true, d: false })).toEqual({
      isCorrect: true,
      score: 1,
    });

    const equal = { ...baseField, gradingOpts: { tfScoring: "EQUAL" as const } };
    expect(gradeField(equal, { a: true, b: false, c: true })).toEqual({
      isCorrect: false,
      score: 0.75,
    });
  });
});

describe("PHOTO_UPLOAD grading & isAnswerFilled", () => {
  it("treats PHOTO_UPLOAD as manual grading in gradeSubmission", () => {
    const summary = gradeSubmission(
      [
        {
          id: "q1",
          type: "TRUE_FALSE_GROUP",
          points: 1,
          answerKey: { correct: { a: true, b: false, c: true, d: false } },
        },
        {
          id: "q2",
          type: "PHOTO_UPLOAD",
          points: 3,
          answerKey: { rubric: "Ghi rõ bước giải" },
        },
      ],
      {
        q1: { a: true, b: false, c: true, d: false },
        q2: {
          files: [
            {
              key: "submissions/s1/q2/photo.jpg",
              name: "bai-giai.jpg",
              mimeType: "image/jpeg",
            },
          ],
        },
      }
    );

    expect(summary.autoScore).toBe(1);
    expect(summary.maxScore).toBe(4);
    expect(summary.hasManualFields).toBe(true);
    expect(summary.fieldResults.q2).toEqual({ isCorrect: null, score: null });
  });

  it("computes isAnswerFilled properly for TRUE_FALSE_GROUP and PHOTO_UPLOAD", () => {
    expect(isAnswerFilled({})).toBe(false);
    expect(isAnswerFilled({ a: null })).toBe(false);
    expect(isAnswerFilled({ a: false })).toBe(true);

    expect(isAnswerFilled({ files: [] })).toBe(false);
    expect(isAnswerFilled({ files: [], note: "Em nop sau" })).toBe(true);
    expect(
      isAnswerFilled({
        files: [{ key: "submissions/s1/q1/1.jpg", name: "1.jpg", mimeType: "image/jpeg" }],
      })
    ).toBe(true);
  });
});

describe("Subject registry and MathText tokenizer", () => {
  it("defines metadata and profiles for all 11 subjects", () => {
    expect(WORKSHEET_SUBJECTS).toHaveLength(11);
    const eng = getSubjectProfile("ENGLISH");
    const math = getSubjectProfile("MATH");
    const lit = getSubjectProfile("LITERATURE");
    const gen = getSubjectProfile("GENERAL");

    expect(eng.showAudio).toBe(true);
    expect(eng.showDictation).toBe(true);
    expect(eng.showEnglishSkills).toBe(true);
    expect(eng.showPassages).toBe(true);

    expect(math.showAudio).toBe(false);
    expect(math.showDictation).toBe(false);
    expect(math.showEnglishSkills).toBe(false);
    expect(math.showMathHint).toBe(true);
    expect(math.primaryTools).toContain("TRUE_FALSE_GROUP");
    expect(math.primaryTools).toContain("PHOTO_UPLOAD");

    expect(lit.showPassages).toBe(true);
    expect(lit.showAudio).toBe(false);
    expect(gen.showAudio).toBe(true);
    expect(gen.showMathHint).toBe(true);
    expect(getSubjectMeta("CHEMISTRY").profile).toBe("STEM");
  });

  it("tokenizes LaTeX math while leaving currency amounts untouched", () => {
    expect(tokenizeMathText("Buy milk for $5 and bread for $10.")).toEqual([
      { kind: "text", value: "Buy milk for $5 and bread for $10." },
    ]);
    expect(tokenizeMathText("Price is \\$50")).toEqual([
      { kind: "text", value: "Price is $50" },
    ]);
    expect(tokenizeMathText("Solve $x^2 - 4 = 0$ and $$\\int_0^1 x\\,dx$$")).toEqual([
      { kind: "text", value: "Solve " },
      { kind: "inline", value: "x^2 - 4 = 0" },
      { kind: "text", value: " and " },
      { kind: "display", value: "\\int_0^1 x\\,dx" },
    ]);
  });
});
