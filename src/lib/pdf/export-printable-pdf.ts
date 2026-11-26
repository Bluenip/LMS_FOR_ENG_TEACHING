import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { FieldType, WorksheetSubject } from "@prisma/client";
import type { FieldOptionsValue, RubricCriterion } from "@/lib/grading/types";
import { detectImageMeta } from "@/lib/image-meta";

export interface PrintableWorksheetField {
  id: string;
  placement: "OVERLAY" | "ANSWER_SHEET";
  type: FieldType;
  label: string;
  prompt: string | null;
  explanation: string | null;
  points: number;
  options: FieldOptionsValue | null;
  answerKey: Record<string, unknown>;
  rubric: RubricCriterion[] | null;
  imageBytes?: Buffer | null;
}

export interface PrintableWorksheetPageInput {
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  imageBytes?: Buffer | null;
}

export interface PrintableWorksheetInput {
  title: string;
  subject: WorksheetSubject;
  instructions: string | null;
  passages: Array<{ id: string; title: string; content: string; order: number }>;
  sourcePdfBuffer: Buffer | null;
  pages: PrintableWorksheetPageInput[];
  fields: PrintableWorksheetField[];
}

let cachedFonts: { regular: Buffer; bold: Buffer } | null = null;

function loadNotoFonts(): { regular: Buffer; bold: Buffer } {
  if (cachedFonts) return cachedFonts;
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  const regular = fs.readFileSync(path.join(fontsDir, "NotoSans-Regular.ttf"));
  const bold = fs.readFileSync(path.join(fontsDir, "NotoSans-Bold.ttf"));
  cachedFonts = { regular, bold };
  return cachedFonts;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push("");
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = "";
    for (const w of words) {
      const candidate = current ? `${current} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        // Break overly long unbreakable tokens
        if (font.widthOfTextAtSize(w, size) > maxWidth) {
          let chunk = "";
          for (const ch of w) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = w;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function formatKeySummary(f: PrintableWorksheetField): string {
  const k = f.answerKey ?? {};
  switch (f.type) {
    case "TEXT":
      return Array.isArray(k.accepted) ? k.accepted.join(" / ") : "";
    case "NUMBER":
      return k.value !== undefined ? String(k.value) : "";
    case "MULTIPLE_CHOICE":
    case "DROPDOWN":
      return typeof k.correct === "string" ? k.correct : "";
    case "MULTI_SELECT":
      return Array.isArray(k.correct) ? k.correct.join(", ") : "";
    case "TRUE_FALSE":
      return k.correct === true ? "Đúng (True)" : k.correct === false ? "Sai (False)" : "";
    case "TRUE_FALSE_GROUP": {
      const map = (k.correct as Record<string, boolean> | undefined) ?? {};
      return Object.entries(map)
        .map(([sub, val]) => `${sub}-${val ? "Đ" : "S"}`)
        .join(", ");
    }
    case "CHECKBOX":
      return k.checked ? "Tick ✓" : "Không tick";
    case "DICTATION":
      return typeof k.transcript === "string" ? k.transcript : "";
    case "ESSAY":
    case "PHOTO_UPLOAD":
    case "VOICE_ANSWER":
    case "DRAW":
      return typeof k.rubric === "string" && k.rubric.trim()
        ? k.rubric.trim()
        : typeof k.note === "string" && k.note.trim()
          ? k.note.trim()
          : "(Chấm thủ công)";
    case "SPEAKING":
      return typeof k.transcript === "string" ? k.transcript : "";
    case "MATCH":
      return Array.isArray(k.pairs)
        ? k.pairs.map((p) => (Array.isArray(p) ? `${p[0]}→${p[1]}` : "")).filter(Boolean).join(", ")
        : "";
    case "DRAG_DROP":
      return k.slots && typeof k.slots === "object"
        ? Object.entries(k.slots as Record<string, unknown>)
            .map(([slot, toks]) => `${slot}: ${Array.isArray(toks) ? toks.join("+") : ""}`)
            .join(" | ")
        : "";
    case "HIGHLIGHT":
      return Array.isArray(k.indices) ? `Vị trí từ: ${k.indices.join(", ")}` : "";
    case "ORDERING":
      return Array.isArray(k.order) ? k.order.join(" → ") : "";
    case "WORDSEARCH":
      return Array.isArray(k.words) ? k.words.join(", ") : "";
    case "CODE":
      return typeof k.expectedOutput === "string" && k.expectedOutput.trim()
        ? `Output: ${k.expectedOutput.trim()}`
        : typeof k.referenceCode === "string"
          ? k.referenceCode.slice(0, 100)
          : "(Chấm code)";
    default:
      return "";
  }
}

/**
 * Generates an A4 printable PDF handout (`mode = "student"`) or answer key (`mode = "key"`)
 * with full Vietnamese Unicode typography using bundled NotoSans TTF fonts.
 */
export async function buildPrintableWorksheetPdf(
  input: PrintableWorksheetInput,
  mode: "student" | "key"
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const { regular: regBytes, bold: boldBytes } = loadNotoFonts();
  const fontRegular = await pdfDoc.embedFont(regBytes, { subset: true });
  const fontBold = await pdfDoc.embedFont(boldBytes, { subset: true });

  const A4_W = 595.28;
  const A4_H = 841.89;
  const MARGIN = 44;
  const CONTENT_W = A4_W - MARGIN * 2;
  const INK = rgb(0.05, 0.11, 0.19);
  const MUTED = rgb(0.32, 0.36, 0.43);
  const ACCENT = rgb(0.21, 0.15, 0.8);

  // 1) If PDF-backed, copy source pages verbatim
  if (input.sourcePdfBuffer) {
    try {
      const srcDoc = await PDFDocument.load(input.sourcePdfBuffer, { ignoreEncryption: true });
      const copied = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      for (const p of copied) pdfDoc.addPage(p);
    } catch {
      // Fallback below if malformed source PDF
    }
  } else if (input.pages.some((p) => p.imageBytes)) {
    // 2) Image-backed worksheet pages (Fill on image)
    for (const pg of input.pages) {
      if (!pg.imageBytes) continue;
      const page = pdfDoc.addPage([pg.widthPt || A4_W, pg.heightPt || A4_H]);
      const meta = detectImageMeta(pg.imageBytes);
      if (meta?.ext === ".png") {
        const img = await pdfDoc.embedPng(pg.imageBytes);
        page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
      } else if (meta?.ext === ".jpg") {
        const img = await pdfDoc.embedJpg(pg.imageBytes);
        page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
      } else {
        page.drawText(`[Trang ảnh ${pg.pageIndex + 1}]`, {
          x: MARGIN,
          y: page.getHeight() / 2,
          size: 12,
          font: fontRegular,
          color: MUTED,
        });
      }
    }
  }

  // Helper cursor state for generated A4 text/question/key pages
  let page: PDFPage | null = null;
  let y = 0;

  const newPage = () => {
    page = pdfDoc.addPage([A4_W, A4_H]);
    y = A4_H - MARGIN;
    return page;
  };

  const ensureSpace = (neededPt: number) => {
    if (!page || y - neededPt < MARGIN) {
      newPage();
    }
  };

  const drawWrapped = (
    text: string,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; lineGap?: number } = {}
  ) => {
    const f = opts.font ?? fontRegular;
    const size = opts.size ?? 10.5;
    const indent = opts.indent ?? 0;
    const lineGap = opts.lineGap ?? 4;
    const lines = wrapText(text, f, size, CONTENT_W - indent);
    for (const ln of lines) {
      ensureSpace(size + lineGap + 2);
      if (ln) {
        page!.drawText(ln, {
          x: MARGIN + indent,
          y: y - size,
          size,
          font: f,
          color: opts.color ?? INK,
        });
      }
      y -= size + lineGap;
    }
  };

  // 3) Render Answer Sheet questions (if no background PDF/images, OR if there are ANSWER_SHEET fields)
  const hasVisualPages = Boolean(input.sourcePdfBuffer) || input.pages.some((p) => p.imageBytes);
  const sheetFields = input.fields.filter((f) => f.placement === "ANSWER_SHEET");
  const fieldsToRender = !hasVisualPages ? input.fields : sheetFields;

  if (fieldsToRender.length > 0 || !hasVisualPages) {
    newPage();
    drawWrapped(input.title, { font: fontBold, size: 15, color: ACCENT, lineGap: 6 });
    drawWrapped(
      `Họ và tên: ....................................................   Lớp: ..................   Ngày: ..../..../......`,
      { size: 9.5, color: MUTED, lineGap: 10 }
    );

    if (input.instructions) {
      drawWrapped(`Hướng dẫn: ${input.instructions}`, {
        font: fontBold,
        size: 10,
        color: MUTED,
        lineGap: 8,
      });
    }

    for (const psg of [...input.passages].sort((a, b) => a.order - b.order)) {
      y -= 4;
      drawWrapped(`[Đọc hiểu] ${psg.title}`, { font: fontBold, size: 11, color: ACCENT });
      drawWrapped(psg.content, { size: 10, color: INK, lineGap: 4 });
      y -= 6;
    }

    for (const f of fieldsToRender) {
      y -= 4;
      const header = `Câu ${f.label} (${f.points} điểm)${f.prompt ? `: ${f.prompt}` : ""}`;
      drawWrapped(header, { font: fontBold, size: 10.5, color: INK, lineGap: 4 });

      if (f.imageBytes) {
        const meta = detectImageMeta(f.imageBytes);
        if (meta && (meta.ext === ".png" || meta.ext === ".jpg")) {
          const img =
            meta.ext === ".png"
              ? await pdfDoc.embedPng(f.imageBytes)
              : await pdfDoc.embedJpg(f.imageBytes);
          const maxImgW = CONTENT_W * 0.7;
          const maxImgH = 180;
          const scale = Math.min(1, maxImgW / meta.width, maxImgH / meta.height);
          const drawW = meta.width * scale;
          const drawH = meta.height * scale;
          ensureSpace(drawH + 10);
          page!.drawImage(img, { x: MARGIN + 12, y: y - drawH, width: drawW, height: drawH });
          y -= drawH + 8;
        }
      }

      if (
        (f.type === "MULTIPLE_CHOICE" || f.type === "MULTI_SELECT" || f.type === "DROPDOWN") &&
        Array.isArray(f.options)
      ) {
        for (const opt of f.options) {
          drawWrapped(`${opt.id}. ${opt.text}`, { indent: 14, size: 10 });
        }
      } else if (f.type === "TRUE_FALSE_GROUP" && Array.isArray(f.options)) {
        for (const opt of f.options) {
          drawWrapped(`${opt.id}) ${opt.text}    [  ] Đúng   [  ] Sai`, { indent: 14, size: 10 });
        }
      } else if (f.type === "MATCH" && f.options && !Array.isArray(f.options)) {
        const mo = f.options as { left?: Array<{ id: string; text: string }>; right?: Array<{ id: string; text: string }> };
        if (Array.isArray(mo.left)) {
          drawWrapped(`Cột trái: ${mo.left.map((x) => `${x.id}) ${x.text}`).join("   |   ")}`, { indent: 14, size: 10 });
        }
        if (Array.isArray(mo.right)) {
          drawWrapped(`Cột phải: ${mo.right.map((x) => `${x.id}) ${x.text}`).join("   |   ")}`, { indent: 14, size: 10 });
        }
      } else if (f.type === "ORDERING" && f.options && !Array.isArray(f.options)) {
        const oo = f.options as { items?: Array<{ id: string; text: string }> };
        if (Array.isArray(oo.items)) {
          for (const it of oo.items) {
            drawWrapped(`[  ] ${it.id}. ${it.text}`, { indent: 14, size: 10 });
          }
        }
      } else if (f.type === "HIGHLIGHT" && f.options && !Array.isArray(f.options)) {
        const ho = f.options as { tokens?: string[] };
        if (Array.isArray(ho.tokens)) {
          drawWrapped(ho.tokens.join(" "), { indent: 14, size: 10 });
        }
      } else if (
        f.type === "ESSAY" ||
        f.type === "PHOTO_UPLOAD" ||
        f.type === "VOICE_ANSWER" ||
        f.type === "DRAW" ||
        f.type === "CODE"
      ) {
        y -= 4;
        drawWrapped("Bài làm: ....................................................................................", {
          indent: 14,
          size: 9.5,
          color: MUTED,
        });
        drawWrapped("...............................................................................................", {
          indent: 14,
          size: 9.5,
          color: MUTED,
        });
      }
    }
  }

  // 4) Answer Key & Explanations appendix when mode === "key"
  if (mode === "key") {
    newPage();
    drawWrapped(`ĐÁP ÁN & HƯỚNG DẪN CHẤM — ${input.title}`, {
      font: fontBold,
      size: 14,
      color: ACCENT,
      lineGap: 10,
    });

    if (input.fields.length === 0) {
      drawWrapped("(Phiếu bài tập chưa có câu hỏi nào.)", { size: 10, color: MUTED });
    }

    for (const f of input.fields) {
      const summary = formatKeySummary(f);
      drawWrapped(`Câu ${f.label} (${f.points}đ): ${summary}`, {
        font: fontBold,
        size: 10.5,
        color: INK,
      });
      if (Array.isArray(f.rubric) && f.rubric.length > 0) {
        for (const c of f.rubric) {
          drawWrapped(`• ${c.title}: tối đa ${c.maxPoints}đ`, {
            indent: 14,
            size: 9.5,
            color: MUTED,
          });
        }
      }
      if (f.explanation) {
        drawWrapped(`Giải thích: ${f.explanation}`, {
          indent: 14,
          size: 9.5,
          color: MUTED,
          lineGap: 5,
        });
      }
      y -= 2;
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
