import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { loadNotoFonts } from "@/lib/pdf/export-printable-pdf";
import {
  OMR_BUBBLE_RADIUS,
  OMR_CANONICAL_HEIGHT,
  OMR_CANONICAL_WIDTH,
  OMR_FIDUCIAL_SIZE,
  getOmrTemplate,
  type OmrTemplateId,
} from "./templates";

const A4 = { w: 595.28, h: 841.89 };
/** The fiducial-centre frame is 500 pt wide, A4 ratio, centred on the page (1 pt = 2 canonical px). */
const FRAME_W = 500;
const FRAME_H = (FRAME_W * OMR_CANONICAL_HEIGHT) / OMR_CANONICAL_WIDTH;
const FRAME_LEFT = (A4.w - FRAME_W) / 2;
const FRAME_TOP = (A4.h - FRAME_H) / 2;
const PT_PER_PX = FRAME_W / OMR_CANONICAL_WIDTH;

const toPt = (x: number, y: number) => ({
  x: FRAME_LEFT + x * PT_PER_PX,
  y: A4.h - (FRAME_TOP + y * PT_PER_PX),
});

export interface OmrPdfStudent {
  name: string;
  sbd: string;
}

function drawSheet(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  opts: { template: OmrTemplateId; title: string; className: string | null; student?: OmrPdfStudent }
) {
  const t = getOmrTemplate(opts.template);
  const black = rgb(0, 0, 0);

  // 4 fiducial squares centred on the frame corners
  const f = OMR_FIDUCIAL_SIZE * PT_PER_PX;
  for (const [cx, cy] of [
    [0, 0],
    [OMR_CANONICAL_WIDTH, 0],
    [OMR_CANONICAL_WIDTH, OMR_CANONICAL_HEIGHT],
    [0, OMR_CANONICAL_HEIGHT],
  ] as const) {
    const p = toPt(cx, cy);
    page.drawRectangle({ x: p.x - f / 2, y: p.y - f / 2, width: f, height: f, color: black });
  }

  const title = opts.title.slice(0, 80);
  const titlePos = toPt(70, 40);
  page.drawText(title, { x: titlePos.x, y: titlePos.y, size: 13, font: fonts.bold, color: black });
  if (opts.className) {
    const cp = toPt(70, 68);
    page.drawText(opts.className.slice(0, 60), { x: cp.x, y: cp.y, size: 9, font: fonts.regular, color: rgb(0.3, 0.3, 0.3) });
  }

  for (const l of t.labels) {
    const p = toPt(l.x, l.y);
    // labels are positioned by their vertical centre
    page.drawText(l.text, {
      x: p.x,
      y: p.y - (l.size * 0.35),
      size: l.size,
      font: l.bold ? fonts.bold : fonts.regular,
      color: black,
    });
  }

  const r = OMR_BUBBLE_RADIUS * PT_PER_PX;
  const prefilled = new Set<string>();
  if (opts.student) {
    opts.student.sbd.split("").forEach((d, i) => prefilled.add(`sbd:${i}:${d}`));
    const np = toPt(t.nameAt.x, t.nameAt.y);
    page.drawText(opts.student.name.slice(0, 40), { x: np.x, y: np.y + 2, size: 11, font: fonts.bold, color: black });
    const sp = toPt(t.sbdTextAt.x, t.sbdTextAt.y);
    opts.student.sbd.split("").forEach((d, i) => {
      page.drawText(d, { x: sp.x - 3 + i * 30 * PT_PER_PX, y: sp.y - 4, size: 10, font: fonts.bold, color: black });
    });
  }
  for (const g of t.groups) {
    for (const b of g.bubbles) {
      const p = toPt(b.x, b.y);
      const filled = prefilled.has(`${g.key}:${b.value}`);
      page.drawCircle({
        x: p.x,
        y: p.y,
        size: r,
        borderColor: black,
        borderWidth: 0.6,
        color: filled ? black : undefined,
      });
    }
  }
}

/**
 * A4 bubble-sheet PDF: one blank sheet, or one pre-filled sheet (name + SBD bubbles) per student.
 */
export async function buildOmrSheetPdf(opts: {
  template: OmrTemplateId;
  title: string;
  className: string | null;
  students: OmrPdfStudent[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const { regular, bold } = loadNotoFonts();
  const fonts = {
    regular: await doc.embedFont(regular, { subset: true }),
    bold: await doc.embedFont(bold, { subset: true }),
  };
  doc.setTitle(opts.title);
  const targets: Array<OmrPdfStudent | undefined> = opts.students.length > 0 ? opts.students : [undefined];
  for (const student of targets) {
    const page = doc.addPage([A4.w, A4.h]);
    drawSheet(page, fonts, { ...opts, student });
  }
  return doc.save();
}
