import { describe, expect, it } from "vitest";
import {
  gradeDragDrop,
  gradeField,
  gradeHighlight,
  gradeMatch,
  gradeOrdering,
  gradeSpeaking,
  gradeSubmission,
  gradeWordsearch,
  generateWordsearchGrid,
  extractWordFromCells,
  isManualFieldType,
  isTrueFalseGroupAnswer,
  lcsLength,
} from "@/lib/grading";
import { isAnswerFilled } from "@/components/worksheet/types";

describe("Phase 19 Unit: 9 Interactive Field Types Pure Grading & Security Helpers", () => {
  it("marks VOICE_ANSWER, DRAW, CODE as manual and distinguishes TrueFalseGroup from interactive objects", () => {
    expect(isManualFieldType("ESSAY")).toBe(true);
    expect(isManualFieldType("PHOTO_UPLOAD")).toBe(true);
    expect(isManualFieldType("VOICE_ANSWER")).toBe(true);
    expect(isManualFieldType("DRAW")).toBe(true);
    expect(isManualFieldType("CODE")).toBe(true);
    expect(isManualFieldType("MATCH")).toBe(false);
    expect(isManualFieldType("WORDSEARCH")).toBe(false);

    expect(isTrueFalseGroupAnswer({ a: true, b: false })).toBe(true);
    expect(isTrueFalseGroupAnswer({ L1: "R1", L2: "R2" })).toBe(false);
    expect(isTrueFalseGroupAnswer({ S1: ["T1"] })).toBe(false);
    expect(isTrueFalseGroupAnswer({ fileKey: "submissions/1/2/a.png" })).toBe(false);
    expect(isTrueFalseGroupAnswer({ code: "console.log(1)", lastOutput: "1" })).toBe(false);
    expect(isTrueFalseGroupAnswer({ text: "hello", tries: 1 })).toBe(false);
    expect(isTrueFalseGroupAnswer({ found: [] })).toBe(false);
  });

  it("gradeMatch supports proportional credit and ALL_OR_NOTHING", () => {
    const key = { pairs: [["L1", "R1"], ["L2", "R2"], ["L3", "R3"]] as Array<[string, string]> };
    expect(gradeMatch(key, { L1: "R1", L2: "R2", L3: "R3" }, 3)).toEqual({
      isCorrect: true,
      score: 3,
    });
    expect(gradeMatch(key, { L1: "R1", L2: "R3", L3: "R2" }, 3)).toEqual({
      isCorrect: false,
      score: 1,
    });
    expect(
      gradeMatch(key, { L1: "R1", L2: "R3", L3: "R2" }, 3, { scoring: "ALL_OR_NOTHING" })
    ).toEqual({
      isCorrect: false,
      score: 0,
    });
  });

  it("gradeDragDrop grades multi-token ordered slots accurately", () => {
    const key = { slots: { S1: ["T1", "T2"], S2: ["T3"] } };
    expect(gradeDragDrop(key, { S1: ["T1", "T2"], S2: ["T3"] }, 4)).toEqual({
      isCorrect: true,
      score: 4,
    });
    expect(gradeDragDrop(key, { S1: ["T2", "T1"], S2: ["T3"] }, 4)).toEqual({
      isCorrect: false,
      score: 2,
    });
  });

  it("gradeSpeaking delegates to word-level Levenshtein diff", () => {
    const full = gradeSpeaking({ transcript: "Nice to meet you" }, { text: "Nice to meet you!", tries: 1 }, 2, {
      ignorePunctuation: true,
      scoring: "WORD_ACCURACY",
    });
    expect(full.isCorrect).toBe(true);
    expect(full.score).toBe(2);
    expect(full.detail?.kind).toBe("DICTATION");

    const half = gradeSpeaking({ transcript: "one two three four" }, { text: "one two", tries: 1 }, 4);
    expect(half.isCorrect).toBe(false);
    expect(half.score).toBe(2);
  });

  it("gradeHighlight penalizes false positives via max(0, tp - fp)", () => {
    const key = { indices: [1, 3, 5] };
    expect(gradeHighlight(key, [5, 1, 3], 3)).toEqual({ isCorrect: true, score: 3 });
    // 2 TP (1, 3), 1 FP (0) => net 1 / 3 => 1 point
    expect(gradeHighlight(key, [0, 1, 3], 3)).toEqual({ isCorrect: false, score: 1 });
    // 0 TP, 2 FP => floor at 0
    expect(gradeHighlight(key, [0, 2], 3)).toEqual({ isCorrect: false, score: 0 });
  });

  it("lcsLength & gradeOrdering support LCS vs EXACT_POS modes", () => {
    expect(lcsLength(["A", "B", "C", "D"], ["B", "C", "D", "A"])).toBe(3);

    const key = { order: ["1", "2", "3", "4"] };
    expect(gradeOrdering(key, ["1", "2", "3", "4"], 4)).toEqual({ isCorrect: true, score: 4 });
    // Rotated by 1: LCS = 3 (1,2,3 shifted) -> 3 pts; EXACT_POS = 0 matched index -> 0 pts
    expect(gradeOrdering(key, ["4", "1", "2", "3"], 4, { orderingScoring: "LCS" })).toEqual({
      isCorrect: false,
      score: 3,
    });
    expect(gradeOrdering(key, ["4", "1", "2", "3"], 4, { orderingScoring: "EXACT_POS" })).toEqual({
      isCorrect: false,
      score: 0,
    });
  });

  it("generateWordsearchGrid is deterministic per seed & gradeWordsearch validates cell coordinates", () => {
    const g1 = generateWordsearchGrid(["CAT", "DOG"], 8, 8, 123);
    const g2 = generateWordsearchGrid(["CAT", "DOG"], 8, 8, 123);
    expect(g1.grid).toEqual(g2.grid);
    expect(g1.placedWords).toEqual(["CAT", "DOG"]);

    // Find CAT's real straight-line cells on g1.grid
    let catCells: Array<[number, number]> | null = null;
    for (let r = 0; r < 8 && !catCells; r++) {
      for (let c = 0; c < 8 && !catCells; c++) {
        if (g1.grid[r]![c] !== "C") continue;
        for (const [dr, dc] of [
          [0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1],
        ] as const) {
          const r2 = r + dr * 2;
          const c2 = c + dc * 2;
          if (r2 < 0 || r2 >= 8 || c2 < 0 || c2 >= 8) continue;
          const path: Array<[number, number]> = [
            [r, c],
            [r + dr, c + dc],
            [r2, c2],
          ];
          if (extractWordFromCells(g1.grid, path) === "CAT") {
            catCells = path;
            break;
          }
        }
      }
    }
    expect(catCells).not.toBeNull();

    const opts = { rows: 8, cols: 8, seed: 123 };
    const wsKey = { words: ["CAT", "DOG"] };
    const validHalf = gradeWordsearch(wsKey, opts, { found: [{ word: "CAT", cells: catCells! }] }, 2);
    expect(validHalf).toEqual({ isCorrect: false, score: 1 });

    // Forged word with non-matching cells MUST be rejected (score 0)!
    const forged = gradeWordsearch(
      wsKey,
      opts,
      { found: [{ word: "CAT", cells: [[0, 0], [0, 2], [0, 4]] }] },
      2
    );
    expect(forged).toEqual({ isCorrect: false, score: 0 });
  });

  it("isAnswerFilled and gradeSubmission handle mixed interactive + manual types cleanly", () => {
    expect(isAnswerFilled({ L1: "R1" })).toBe(true);
    expect(isAnswerFilled({})).toBe(false);
    expect(isAnswerFilled({ found: [] })).toBe(false);
    expect(isAnswerFilled({ found: [{ word: "CAT", cells: [[0, 0], [0, 1], [0, 2]] }] })).toBe(true);
    expect(isAnswerFilled({ fileKey: "submissions/s1/f1/a.png" })).toBe(true);
    expect(isAnswerFilled({ code: "  " })).toBe(false);
    expect(isAnswerFilled({ code: "print(1)" })).toBe(true);

    const summary = gradeSubmission(
      [
        {
          id: "f1",
          type: "MATCH",
          points: 2,
          answerKey: { pairs: [["L1", "R1"]] },
        },
        {
          id: "f2",
          type: "CODE",
          points: 3,
          options: { language: "javascript" },
          answerKey: { referenceCode: "console.log(1)" },
        },
      ],
      {
        f1: { L1: "R1" },
        f2: { code: "console.log(1)" },
      }
    );
    expect(summary.autoScore).toBe(2);
    expect(summary.maxScore).toBe(5);
    expect(summary.hasManualFields).toBe(true);
    expect(gradeField({ id: "f2", type: "DRAW", points: 2, answerKey: {} }, { fileKey: "x" })).toEqual({
      isCorrect: null,
      score: null,
    });
  });
});
