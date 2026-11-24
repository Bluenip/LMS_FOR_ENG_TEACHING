import { describe, expect, it } from "vitest";
import {
  gradeField,
  gradeSubmission,
  normalizeText,
  parseBulkAnswerString,
} from "@/lib/grading";

describe("normalizeText", () => {
  it("trims, collapses spaces, lowercases, and unifies curly apostrophes by default", () => {
    expect(normalizeText("  Don’t   stop   believing  ")).toBe("don't stop believing");
    expect(normalizeText("She\u2019s   here")).toBe("she's here");
  });

  it("respects caseSensitive and ignorePunctuation options", () => {
    expect(normalizeText("Hello, World!", { ignorePunctuation: true })).toBe("hello world");
    expect(normalizeText("London", { caseSensitive: true })).toBe("London");
    expect(normalizeText("london", { caseSensitive: true })).toBe("london");
  });

  it("normalizes Vietnamese unicode NFC/NFD identically", () => {
    const nfc = "Tiếng Việt".normalize("NFC");
    const nfd = "Tiếng Việt".normalize("NFD");
    expect(normalizeText(nfc)).toBe(normalizeText(nfd));
  });
});

describe("gradeField", () => {
  it("grades TEXT with multiple accepted answers, curly quotes, spaces, and edge cases", () => {
    const field = {
      id: "f1",
      type: "TEXT" as const,
      points: 2,
      answerKey: { accepted: ["don't", "do not"] },
      gradingOpts: { caseSensitive: false, ignoreExtraSpaces: true },
    };

    expect(gradeField(field, "  DON’T  ")).toEqual({ isCorrect: true, score: 2 });
    expect(gradeField(field, "do   not")).toEqual({ isCorrect: true, score: 2 });
    expect(gradeField(field, "")).toEqual({ isCorrect: false, score: 0 });
    expect(gradeField(field, null)).toEqual({ isCorrect: false, score: 0 });
    expect(gradeField(field, "does not")).toEqual({ isCorrect: false, score: 0 });
  });

  it("grades TEXT with caseSensitive and ignorePunctuation", () => {
    const field = {
      id: "f1b",
      type: "TEXT" as const,
      points: 1,
      answerKey: { accepted: ["Hanoi"] },
      gradingOpts: { caseSensitive: true, ignorePunctuation: true },
    };
    expect(gradeField(field, "Hanoi.")).toEqual({ isCorrect: true, score: 1 });
    expect(gradeField(field, "hanoi")).toEqual({ isCorrect: false, score: 0 });
  });

  it("grades NUMBER with exact value, tolerance, comma decimal, and empty input", () => {
    const field = {
      id: "f2",
      type: "NUMBER" as const,
      points: 1.5,
      answerKey: { value: 3.14, tolerance: 0.05 },
    };
    expect(gradeField(field, 3.14)).toEqual({ isCorrect: true, score: 1.5 });
    expect(gradeField(field, "3,18")).toEqual({ isCorrect: true, score: 1.5 });
    expect(gradeField(field, "3.25")).toEqual({ isCorrect: false, score: 0 });
    expect(gradeField(field, "abc")).toEqual({ isCorrect: false, score: 0 });
    expect(gradeField(field, "")).toEqual({ isCorrect: false, score: 0 });
  });

  it("grades MULTIPLE_CHOICE and DROPDOWN", () => {
    const mc = {
      id: "f3",
      type: "MULTIPLE_CHOICE" as const,
      points: 1,
      answerKey: { correct: "B" },
    };
    expect(gradeField(mc, "B")).toEqual({ isCorrect: true, score: 1 });
    expect(gradeField(mc, "A")).toEqual({ isCorrect: false, score: 0 });
    expect(gradeField(mc, "")).toEqual({ isCorrect: false, score: 0 });

    const dd = {
      id: "f4",
      type: "DROPDOWN" as const,
      points: 1,
      answerKey: { correct: "so" },
    };
    expect(gradeField(dd, "so")).toEqual({ isCorrect: true, score: 1 });
    expect(gradeField(dd, "but")).toEqual({ isCorrect: false, score: 0 });
  });

  it("grades MULTI_SELECT with and without partialCredit", () => {
    const exactField = {
      id: "f5",
      type: "MULTI_SELECT" as const,
      points: 2,
      answerKey: { correct: ["A", "C"] },
      gradingOpts: { partialCredit: false },
    };
    expect(gradeField(exactField, ["C", "A"])).toEqual({ isCorrect: true, score: 2 });
    expect(gradeField(exactField, ["A"])).toEqual({ isCorrect: false, score: 0 });

    const partialField = {
      ...exactField,
      gradingOpts: { partialCredit: true },
    };
    expect(gradeField(partialField, ["A"])).toEqual({ isCorrect: false, score: 1 });
    expect(gradeField(partialField, ["A", "B"])).toEqual({ isCorrect: false, score: 0 });
    expect(gradeField(partialField, ["B", "D"])).toEqual({ isCorrect: false, score: 0 });
  });

  it("grades TRUE_FALSE and CHECKBOX", () => {
    const tf = {
      id: "f6",
      type: "TRUE_FALSE" as const,
      points: 1,
      answerKey: { correct: false },
    };
    expect(gradeField(tf, false)).toEqual({ isCorrect: true, score: 1 });
    expect(gradeField(tf, "false")).toEqual({ isCorrect: true, score: 1 });
    expect(gradeField(tf, true)).toEqual({ isCorrect: false, score: 0 });
    expect(gradeField(tf, "")).toEqual({ isCorrect: false, score: 0 });

    const cb = {
      id: "f7",
      type: "CHECKBOX" as const,
      points: 1,
      answerKey: { checked: true },
    };
    expect(gradeField(cb, true)).toEqual({ isCorrect: true, score: 1 });
    expect(gradeField(cb, false)).toEqual({ isCorrect: false, score: 0 });

    // "Do not tick" key: blank must NOT earn points, only an explicit false does
    const cbFalse = { ...cb, id: "f7b", answerKey: { checked: false } };
    expect(gradeField(cbFalse, false)).toEqual({ isCorrect: true, score: 1 });
    expect(gradeField(cbFalse, undefined)).toEqual({ isCorrect: false, score: 0 });
    expect(gradeField(cbFalse, "")).toEqual({ isCorrect: false, score: 0 });
    expect(gradeField(cbFalse, null)).toEqual({ isCorrect: false, score: 0 });
  });

  it("marks ESSAY as requiring manual grading (null score & isCorrect)", () => {
    const essay = {
      id: "f8",
      type: "ESSAY" as const,
      points: 3,
      answerKey: { rubric: "Clear structure" },
    };
    expect(gradeField(essay, "My long essay answer")).toEqual({
      isCorrect: null,
      score: null,
    });
  });
});

describe("gradeSubmission", () => {
  it("computes autoScore, maxScore, and hasManualFields accurately", () => {
    const summary = gradeSubmission(
      [
        { id: "q1", type: "MULTIPLE_CHOICE", points: 1, answerKey: { correct: "A" } },
        { id: "q2", type: "TEXT", points: 2, answerKey: { accepted: ["has lived"] } },
        { id: "q3", type: "ESSAY", points: 3, answerKey: { rubric: "Essay" } },
      ],
      { q1: "A", q2: "HAS  LIVED", q3: "Good teamwork" }
    );

    expect(summary.autoScore).toBe(3);
    expect(summary.maxScore).toBe(6);
    expect(summary.hasManualFields).toBe(true);
    expect(summary.fieldResults.q1?.isCorrect).toBe(true);
    expect(summary.fieldResults.q3?.isCorrect).toBeNull();
  });
});

describe("parseBulkAnswerString", () => {
  it("parses space-separated contiguous letters", () => {
    expect(parseBulkAnswerString("ABCDA BCDDA")).toEqual([
      "A",
      "B",
      "C",
      "D",
      "A",
      "B",
      "C",
      "D",
      "D",
      "A",
    ]);
  });

  it("parses numbered patterns like 1A 2B 3C and 1.A 2:B 3-C", () => {
    expect(parseBulkAnswerString("1A 2B 3C 4D")).toEqual(["A", "B", "C", "D"]);
    expect(parseBulkAnswerString("3-C, 1.a, 2:B")).toEqual(["A", "B", "C"]);
  });

  it("returns empty array for blank input", () => {
    expect(parseBulkAnswerString("   ")).toEqual([]);
  });
});
