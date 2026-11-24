import { describe, expect, it } from "vitest";
import {
  gradeDictationText,
  gradeField,
  sanitizeDictationDetail,
} from "@/lib/grading";

describe("Dictation word-level grading", () => {
  it("awards 100% score on exact match ignoring punctuation and case by default", () => {
    const res = gradeDictationText(
      "Good morning, everyone! Today we practice English.",
      "good morning everyone today we practice english",
      2
    );
    expect(res.isCorrect).toBe(true);
    expect(res.score).toBe(2);
    expect(res.detail.correctWords).toBe(7);
    expect(res.detail.totalWords).toBe(7);
    expect(res.detail.wrongWords).toBe(0);
    expect(res.detail.missingWords).toBe(0);
    expect(res.detail.extraWords).toBe(0);
  });

  it("awards proportional word accuracy (8/10 correct on 2pt = 1.6pt)", () => {
    const transcript = "one two three four five six seven eight nine ten";
    const student = "one two three four five six seven eight wrong1 wrong2";
    const res = gradeDictationText(transcript, student, 2);
    expect(res.isCorrect).toBe(false);
    expect(res.score).toBe(1.6);
    expect(res.detail.correctWords).toBe(8);
    expect(res.detail.wrongWords).toBe(2);
    expect(res.detail.missingWords).toBe(0);
  });

  it("handles missing words and marks them as missing tokens", () => {
    const res = gradeDictationText(
      "the quick brown fox jumps over",
      "the quick fox over",
      3
    );
    expect(res.isCorrect).toBe(false);
    expect(res.detail.correctWords).toBe(4);
    expect(res.detail.missingWords).toBe(2);
    expect(res.score).toBe(2);
    expect(res.detail.tokens.filter((t) => t.kind === "missing").map((t) => t.text)).toEqual([
      "brown",
      "jumps",
    ]);
  });

  it("penalizes extra junk words (prevents dictionary-stuffing cheat)", () => {
    const res = gradeDictationText(
      "hello world",
      "hello world junk1 junk2 junk3 junk4 junk5 junk6",
      2
    );
    expect(res.isCorrect).toBe(false);
    expect(res.detail.correctWords).toBe(2);
    expect(res.detail.extraWords).toBe(6);
    expect(res.score).toBe(0.5); // 2/8 * 2
  });

  it("supports ALL_OR_NOTHING scoring and case-sensitive mode", () => {
    const partial = gradeField(
      {
        id: "d1",
        type: "DICTATION",
        points: 2,
        answerKey: { transcript: "Hello World" },
        gradingOpts: { caseSensitive: true, scoring: "ALL_OR_NOTHING" },
      },
      "hello World"
    );
    expect(partial.isCorrect).toBe(false);
    expect(partial.score).toBe(0);

    const exact = gradeField(
      {
        id: "d1",
        type: "DICTATION",
        points: 2,
        answerKey: { transcript: "Hello World" },
        gradingOpts: { caseSensitive: true, scoring: "ALL_OR_NOTHING" },
      },
      "Hello World"
    );
    expect(exact.isCorrect).toBe(true);
    expect(exact.score).toBe(2);
  });

  it("sanitizes expected and missing words when revealKey is false", () => {
    const res = gradeDictationText("secret transcript words here", "secret wrong here", 2);
    const hidden = sanitizeDictationDetail(res.detail, false);
    expect(hidden).not.toBeNull();
    expect(JSON.stringify(hidden)).not.toContain("transcript");
    expect(hidden!.tokens.some((t) => t.kind === "missing")).toBe(false);
    expect(hidden!.tokens.every((t) => t.expected === undefined)).toBe(true);

    const shown = sanitizeDictationDetail(res.detail, true);
    expect(JSON.stringify(shown)).toContain("transcript");
  });
});
