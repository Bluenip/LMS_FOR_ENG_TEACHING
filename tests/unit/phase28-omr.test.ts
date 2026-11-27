import { describe, expect, it } from "vitest";
import {
  applyHomography,
  solveHomography8pt,
  warpToCanonical,
} from "@/lib/omr/perspective-warp";
import { classifyFills, readBubbles } from "@/lib/omr/bubble-reader";
import { defaultPointsConfig, gradeOmrAnswers, shortAnswerMatches } from "@/lib/omr/grader";
import { idMarks, marksFromValues, renderSyntheticSheet } from "@/lib/omr/synthetic";
import { buildOmrSheetPdf } from "@/lib/omr/pdf-sheet-generator";

const tilted = {
  width: 1300,
  height: 1700,
  corners: [
    { x: 140, y: 120 },
    { x: 1150, y: 170 },
    { x: 1190, y: 1580 },
    { x: 90, y: 1530 },
  ] as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }],
};

describe("Phase 28 Unit: OMR homography, bubble reading & grading", () => {
  it("solveHomography8pt maps the 4 control points exactly and interpolates projectively", () => {
    const src = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const dst = [
      { x: 10, y: 20 },
      { x: 210, y: 30 },
      { x: 190, y: 260 },
      { x: 5, y: 240 },
    ];
    const H = solveHomography8pt(src, dst);
    src.forEach((p, i) => {
      const q = applyHomography(H, p);
      expect(q.x).toBeCloseTo(dst[i]!.x, 6);
      expect(q.y).toBeCloseTo(dst[i]!.y, 6);
    });
    expect(() => solveHomography8pt([src[0]!, src[0]!, src[0]!, src[0]!], dst)).toThrow();
  });

  it("classifyFills: clear mark, faint mark, double mark and blank", () => {
    expect(classifyFills([0.05, 0.9, 0.04, 0.03])).toEqual({ index: 1, status: "OK" });
    expect(classifyFills([0.02, 0.35, 0.03, 0.01])).toEqual({ index: 1, status: "FAINT" });
    expect(classifyFills([0.8, 0.85, 0.02, 0.02]).status).toBe("MULTI");
    expect(classifyFills([0.02, 0.05, 0.03, 0.04])).toEqual({ index: null, status: "BLANK" });
  });

  it("reads a tilted photo of an MC_20 sheet: SBD, code, clear / faint / double marks", () => {
    const values: Record<string, string> = { ...idMarks("123456", "102") };
    const key = "ABCDDCBAABCDDCBAABCD";
    for (let q = 1; q <= 20; q++) values[`mc:${q}`] = key[q - 1]!;
    delete values["mc:20"]; // left blank
    const marks: Record<string, ReturnType<typeof marksFromValues>[string] | Array<{ value: string; ink?: number }>> = marksFromValues(values);
    marks["mc:5"] = { value: "D", ink: 185 }; // faint pencil
    marks["mc:6"] = [{ value: "C" }, { value: "A" }]; // two bubbles filled

    const photo = renderSyntheticSheet({ template: "MC_20", marks, photo: tilted });
    const { gray } = warpToCanonical(photo);
    const res = readBubbles(gray, "MC_20");

    expect(res.answers.sbd).toBe("123456");
    expect(res.answers.variantCode).toBe("102");
    expect(res.answers.mc["1"]).toBe("A");
    expect(res.answers.mc["4"]).toBe("D");
    expect(res.answers.mc["19"]).toBe("C");
    expect(res.answers.mc["20"]).toBeNull();
    expect(res.answers.mc["6"]).toBeNull();
    expect(res.reviewKeys).toEqual(expect.arrayContaining(["mc:5", "mc:6"]));
    expect(res.reviewKeys).toHaveLength(2);
    expect(res.needsReview).toBe(true);
  });

  it("reads THPT 2025 parts (MC, true/false statements, short answer digits)", () => {
    const values: Record<string, string> = { ...idMarks("000042", "101"), "mc:1": "B", "mc:12": "D" };
    Object.assign(values, { "tf:1:a": "T", "tf:1:b": "F", "tf:1:c": "T", "tf:1:d": "T", "tf:4:a": "F" });
    "-1,5".split("").forEach((ch, i) => (values[`sa:2:${i}`] = ch));
    "12".split("").forEach((ch, i) => (values[`sa:6:${i}`] = ch));
    const photo = renderSyntheticSheet({ template: "THPT_2025", marks: marksFromValues(values), photo: tilted });
    const res = readBubbles(warpToCanonical(photo).gray, "THPT_2025");
    expect(res.needsReview).toBe(false);
    expect(res.answers.mc["1"]).toBe("B");
    expect(res.answers.mc["12"]).toBe("D");
    expect(res.answers.tf["1"]).toEqual({ a: true, b: false, c: true, d: true });
    expect(res.answers.tf["4"]).toEqual({ a: false, b: null, c: null, d: null });
    expect(res.answers.sa["2"]).toBe("-1,5");
    expect(res.answers.sa["6"]).toBe("12");
    expect(res.answers.sa["3"]).toBeNull();
  });

  it("throws when the fiducial squares are not visible", () => {
    const blank = { width: 400, height: 500, data: new Uint8ClampedArray(400 * 500).fill(240) };
    expect(() => warpToCanonical(blank)).toThrow("FIDUCIALS_NOT_FOUND");
  });

  it("grades MC by variant code and THPT 2025 with progressive true/false scoring", () => {
    const keys = { "101": { mc: { "1": "A", "2": "B" } }, "102": { mc: { "1": "B", "2": "B" } } };
    const pts = { mcPoints: 5, tfPoints: 0, saPoints: 0 };
    const answers = { variantCode: "102", mc: { "1": "B", "2": "C" }, tf: {}, sa: {} };
    const g = gradeOmrAnswers("MC_20", answers, keys, pts);
    expect(g).toMatchObject({ score: 5, maxScore: 10, variantUsed: "102" });
    // unknown code with several variants → nothing to grade against
    expect(gradeOmrAnswers("MC_20", { ...answers, variantCode: "999" }, keys, pts).variantUsed).toBeNull();

    const thptKey = {
      default: {
        mc: { "1": "A" },
        tf: { "1": { a: true, b: false, c: true, d: false } },
        sa: { "1": "1,5" },
      },
    };
    const cfg = defaultPointsConfig("THPT_2025");
    const three = gradeOmrAnswers(
      "THPT_2025",
      { variantCode: null, mc: { "1": "A" }, tf: { "1": { a: true, b: false, c: true, d: true } }, sa: { "1": "1.50" } },
      thptKey,
      cfg
    );
    expect(three.perQuestion.find((p) => p.key === "tf:1")!.points).toBe(0.5); // 3/4 → 50%
    expect(three.score).toBe(0.25 + 0.5 + 0.5);
    expect(three.maxScore).toBe(1.75);
    expect(shortAnswerMatches("-0,25", "-.25")).toBe(true);
    expect(shortAnswerMatches("12", "1,2")).toBe(false);
  });

  it("buildOmrSheetPdf returns a PDF (blank and pre-filled per student)", async () => {
    const pdf = await buildOmrSheetPdf({
      template: "THPT_2025",
      title: "Kiểm tra 15 phút",
      className: "12A1",
      students: [
        { name: "Nguyễn Văn A", sbd: "123456" },
        { name: "Trần Thị B", sbd: "654321" },
      ],
    });
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
    const blank = await buildOmrSheetPdf({ template: "MC_20", title: "Test", className: null, students: [] });
    expect(Buffer.from(blank).subarray(0, 4).toString()).toBe("%PDF");
  });
});
