import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { parseFillBlankText } from "@/lib/worksheet/fill-blank-parser";
import { buildSampleFillBlankDocx } from "@/lib/worksheet/docx-builder";
import { formatAttemptsLimit, formatAttemptsProgress } from "@/lib/utils";

describe("Word fill-in-the-blank parser (__answer__ & __a/b__)", () => {
  it("parses single and multi-accepted answers separated by /", () => {
    const raw = `
      Câu 1: How many __planets are there in the universe__?
      Câu 2: How many __planets are there in the universe/stars are there in the universe__?
    `;
    const res = parseFillBlankText(raw);
    expect(res.fields).toHaveLength(2);
    expect(res.fields[0]?.label).toBe("1");
    expect(res.fields[0]?.prompt).toBe("How many ________?");
    expect(res.fields[0]?.accepted).toEqual(["planets are there in the universe"]);
    expect(res.fields[1]?.label).toBe("2");
    expect(res.fields[1]?.accepted).toEqual([
      "planets are there in the universe",
      "stars are there in the universe",
    ]);
  });

  it("handles real-world Word doc quirks (double numbering, NBSP, space inside __, multi-blank sentences)", () => {
    const realDoc = `
Câu 1: 1.\u00A0\u00A0\u00A0 What __do you know about jungles__?
Câu 2: 2.\u00A0\u00A0\u00A0 Have you __ever been in the jungle__?
Câu 3: 3.\u00A0\u00A0\u00A0 Jungles__ are very beautiful places but they can be dangerous as well__.
Câu 7: 7.\u00A0\u00A0\u00A0 (1) __Find a hill__. Climb __a hill so that you can see over the top of the trees__.
Câu 10: 10.\u00A0\u00A0\u00A0\u00A0 (2) __Make a safe camp__. Find __a dry place__, but __don't camp very near trees__.
    `;
    const res = parseFillBlankText(realDoc);
    // 1 + 1 + 1 + 2 + 3 = 8 blanks
    expect(res.fields).toHaveLength(8);
    expect(res.fields[0]?.label).toBe("1");
    expect(res.fields[0]?.prompt).toBe("What ________?");

    // Câu 3: space accidentally inside __ are ...__ should be normalized cleanly
    expect(res.fields[2]?.label).toBe("3");
    expect(res.fields[2]?.prompt).toBe("Jungles ________.");
    expect(res.fields[2]?.accepted).toEqual([
      "are very beautiful places but they can be dangerous as well",
    ]);

    // Câu 7: 2 blanks -> 7a, 7b
    expect(res.fields[3]?.label).toBe("7a");
    expect(res.fields[3]?.prompt).toBe("(1) ____ [7a] ____. Climb ________.");
    expect(res.fields[4]?.label).toBe("7b");
    expect(res.fields[4]?.accepted).toEqual([
      "a hill so that you can see over the top of the trees",
    ]);

    // Câu 10: 3 blanks -> 10a, 10b, 10c
    expect(res.fields.slice(5).map((f) => f.label)).toEqual(["10a", "10b", "10c"]);
    expect(res.fields[7]?.accepted).toEqual(["don't camp very near trees"]);
  });

  it("generates a valid .docx template that round-trips cleanly through mammoth", async () => {
    const buf = await buildSampleFillBlankDocx();
    const extracted = await mammoth.extractRawText({ buffer: buf });
    const parsed = parseFillBlankText(extracted.value);
    expect(parsed.fields.length).toBeGreaterThanOrEqual(5);
    expect(parsed.fields[0]?.accepted).toContain("planets are there in the universe");
    expect(parsed.fields[0]?.accepted).toContain("stars are there in the universe");
  });
});

describe("formatAttempts helpers", () => {
  it("formats unlimited (null) and numeric limits accurately", () => {
    expect(formatAttemptsLimit(null)).toBe("Không giới hạn lượt");
    expect(formatAttemptsLimit(3)).toBe("3 lượt làm");
    expect(formatAttemptsProgress(5, null)).toBe("5/∞");
    expect(formatAttemptsProgress(2, 3)).toBe("2/3");
  });
});
