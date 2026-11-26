import { describe, expect, it } from "vitest";
import zlib from "zlib";
import {
  MAX_HISTORY,
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from "@/lib/worksheet/editor-history";
import {
  parseWordExamHtml,
  parseWordExamText,
} from "@/lib/worksheet/word-exam-parser";
import {
  computeBoxIoU,
  detectPdfBlanks,
} from "@/lib/worksheet/pdf-blank-detector";
import { detectImageMeta, normalizeImagePagePt } from "@/lib/image-meta";
import { FORMULA_SNIPPET_GROUPS } from "@/lib/worksheet/formula-snippets";

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePng(width: number, height: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((1 + width * 3) * height);
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

function makeMinimalJpegSof0(width: number, height: number): Buffer {
  return Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0
    0x00, 0x0b, // length = 11
    0x08, // precision
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, // components
    0x01, 0x11, 0x00,
    0xff, 0xd9, // EOI
  ]);
}

function makeMinimalWebpVp8(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(22, 4);
  buf.write("WEBP", 8, "ascii");
  buf.write("VP8 ", 12, "ascii");
  buf.writeUInt32LE(10, 16);
  buf[23] = 0x9d;
  buf[24] = 0x01;
  buf[25] = 0x2a;
  buf.writeUInt16LE(width & 0x3fff, 26);
  buf.writeUInt16LE(height & 0x3fff, 28);
  return buf;
}

describe("Phase 17: Studio History, Parsers, Blank Detector, Image Meta & Formula Snippets", () => {
  it("manages Undo/Redo stack with MAX_HISTORY=50 cap, coalescing, and future reset", () => {
    let h = createHistory<string[]>(["q0"]);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);

    h = pushHistory(h, ["q0", "q1"], { now: 1000 });
    expect(canUndo(h)).toBe(true);
    expect(h.past).toHaveLength(1);

    // Coalescing within 400ms merges consecutive updates into present without growing past
    h = pushHistory(h, ["q0", "q1a"], { replaceWithinMs: 400, now: 1200 });
    h = pushHistory(h, ["q0", "q1ab"], { replaceWithinMs: 400, now: 1350 });
    expect(h.past).toHaveLength(1);
    expect(h.present).toEqual(["q0", "q1ab"]);

    // Undo and Redo
    h = undoHistory(h);
    expect(h.present).toEqual(["q0"]);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(true);

    h = redoHistory(h);
    expect(h.present).toEqual(["q0", "q1ab"]);
    expect(canRedo(h)).toBe(false);

    // Pushing after undo clears future stack
    h = undoHistory(h);
    h = pushHistory(h, ["q0", "newBranch"], { now: 2500 });
    expect(canRedo(h)).toBe(false);

    // Cap at MAX_HISTORY = 50
    let big = createHistory<number>(0);
    for (let i = 1; i <= 65; i++) {
      big = pushHistory(big, i, { now: i * 1000 });
    }
    expect(big.past).toHaveLength(MAX_HISTORY);
    expect(big.past[0]).toBe(65 - MAX_HISTORY);
    expect(big.present).toBe(65);
  });

  it("parses mixed Word HTML exams: MCQ (bold, underline, asterisk, tail key table), THPT 2025 T/F, fill-blank & essay", () => {
    const html = `
      <p>Câu 1: Thủ đô của Việt Nam là gì?</p>
      <p>A. Đà Nẵng   <strong>B. Hà Nội</strong>   C. Huế   D. Cần Thơ</p>
      <p>Câu 2: Cho hàm số y = x<sup>2</sup> - 4x + 3. Khẳng định nào sau đây đúng?</p>
      <p>a) Đỉnh parabol là I(2; -1). (Đ)</p>
      <p>b) Hàm số đồng biến trên R. (S)</p>
      <p>c) Đồ thị cắt trục tung tại (0; 3).</p>
      <p>d) Phương trình y = 0 có nghiệm x = 1 và x = 3.</p>
      <p>Câu 3: Nước sôi ở __100__ độ C.</p>
      <p>Câu 4: [Tự luận] Nêu ý nghĩa của định luật bảo toàn năng lượng.</p>
      <p>Câu 5: Giải phương trình 2x + 4 = 0:</p>
      <p>A. x = 2</p>
      <p>*B. x = -2</p>
      <p>C. x = 4</p>
      <p>D. x = 0</p>
      <p>Đáp án:</p>
      <table>
        <tr><td>2c</td><td>Đ</td></tr>
        <tr><td>2d</td><td>Đ</td></tr>
      </table>
    `;

    const res = parseWordExamHtml(html, { defaultPoints: 1 });
    expect(res.counts).toEqual({
      multipleChoice: 2,
      trueFalseGroup: 1,
      fillBlank: 1,
      essay: 1,
    });

    expect(res.fields[0]?.type).toBe("MULTIPLE_CHOICE");
    expect(res.fields[0]?.answerKey).toEqual({ correct: "B" });

    expect(res.fields[1]?.type).toBe("TRUE_FALSE_GROUP");
    expect(res.fields[1]?.options).toHaveLength(4);
    expect(res.fields[1]?.answerKey).toEqual({
      correct: { a: true, b: false, c: true, d: true },
    });
    expect(res.fields[1]?.gradingOpts).toEqual({ tfScoring: "THPT_2025" });

    expect(res.fields[2]?.type).toBe("TEXT");
    expect(res.fields[2]?.answerKey).toEqual({ accepted: ["100"] });

    expect(res.fields[3]?.type).toBe("ESSAY");

    expect(res.fields[4]?.type).toBe("MULTIPLE_CHOICE");
    expect(res.fields[4]?.answerKey).toEqual({ correct: "B" });

    // Also test plain text bottom answer table parsing
    const txtRes = parseWordExamText(
      "Câu 1: 1 + 1 = ?\nA. 1\nB. 2\nC. 3\nD. 4\nĐáp án: 1.B"
    );
    expect(txtRes.fields[0]?.answerKey).toEqual({ correct: "B" });
  });

  it("detects underline blanks & checkboxes from PDF text items and deduplicates overlapping boxes", () => {
    const items = [
      { str: "1. Họ tên: ____________", transform: [12, 0, 0, 12, 60, 700], width: 220, height: 12 },
      { str: "2. Chọn: [ ] Đúng  ☐ Sai", transform: [12, 0, 0, 12, 60, 620], width: 200, height: 12 },
      { str: "3. Đã vẽ sẵn: ________", transform: [12, 0, 0, 12, 60, 500], width: 180, height: 12 },
    ];

    // Pre-existing overlay right over question 3's blank
    const approxQ3Y = (842 - 500 - 12 * 1.18) / 842;
    const approxQ3X = (60 + 180 * (14 / 22)) / 595;
    const existing = [
      {
        pageIndex: 0,
        x: approxQ3X,
        y: approxQ3Y,
        w: 0.15,
        h: 0.03,
      },
    ];

    expect(computeBoxIoU({ x: 0, y: 0, w: 0.2, h: 0.2 }, { x: 0, y: 0, w: 0.2, h: 0.2 })).toBeCloseTo(1);
    expect(computeBoxIoU({ x: 0, y: 0, w: 0.1, h: 0.1 }, { x: 0.5, y: 0.5, w: 0.1, h: 0.1 })).toBe(0);

    const detected = detectPdfBlanks(items, { width: 595, height: 842 }, 0, existing);
    expect(detected.some((b) => b.type === "TEXT" && b.snippet.includes("Họ tên"))).toBe(true);
    expect(detected.filter((b) => b.type === "CHECKBOX").length).toBeGreaterThanOrEqual(2);
    expect(detected.some((b) => b.snippet.includes("Đã vẽ sẵn"))).toBe(false);
    for (const b of detected) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(1);
      expect(b.y + b.h).toBeLessThanOrEqual(1);
    }
  });

  it("parses PNG, JPEG, WebP magic bytes + dimensions accurately and normalizes image page to 595pt width", () => {
    const png = makePng(1200, 800);
    expect(detectImageMeta(png)).toEqual({
      ext: ".png",
      mime: "image/png",
      width: 1200,
      height: 800,
    });

    const jpg = makeMinimalJpegSof0(1024, 768);
    expect(detectImageMeta(jpg)).toEqual({
      ext: ".jpg",
      mime: "image/jpeg",
      width: 1024,
      height: 768,
    });

    const webp = makeMinimalWebpVp8(640, 480);
    expect(detectImageMeta(webp)).toEqual({
      ext: ".webp",
      mime: "image/webp",
      width: 640,
      height: 480,
    });

    expect(detectImageMeta(Buffer.from("not an image at all"))).toBeNull();

    const pt = normalizeImagePagePt(1190, 1684);
    expect(pt.widthPt).toBe(595);
    expect(pt.heightPt).toBeCloseTo(842, 1);
  });

  it("exposes 4 non-empty formula snippet groups with KaTeX-wrapped snippets", () => {
    expect(FORMULA_SNIPPET_GROUPS.map((g) => g.id)).toEqual([
      "basic",
      "calculus",
      "geometry",
      "chemistry",
    ]);
    for (const grp of FORMULA_SNIPPET_GROUPS) {
      expect(grp.items.length).toBeGreaterThanOrEqual(5);
      for (const item of grp.items) {
        expect(item.insert.startsWith("$")).toBe(true);
        expect(item.insert.endsWith("$")).toBe(true);
      }
    }
  });
});
