/**
 * Bubble-sheet layouts. All positions live in a canonical 1000×1414 px space (A4 ratio) whose four
 * corners are the CENTERS of the four fiducial squares printed on the sheet. `u`/`v` are the same
 * positions normalised to 0..1, so they are valid for any warped image size.
 */
export type OmrTemplateId = "MC_20" | "MC_40" | "MC_50" | "THPT_2025";

export const OMR_CANONICAL_WIDTH = 1000;
export const OMR_CANONICAL_HEIGHT = 1414;
/** Bubble radius in canonical px (13 px = 6.5 pt on the printed A4 sheet). */
export const OMR_BUBBLE_RADIUS = 13;
/** Fiducial square side in canonical px (40 px = 20 pt). */
export const OMR_FIDUCIAL_SIZE = 40;

export type OmrGroupKind = "SBD" | "VARIANT" | "MC" | "TF" | "SA";

export interface OmrBubble {
  value: string;
  x: number;
  y: number;
  u: number;
  v: number;
}

export interface OmrBubbleGroup {
  /** "sbd:0", "variant:2", "mc:7", "tf:2:c", "sa:3:1" */
  key: string;
  kind: OmrGroupKind;
  /** Question number (1-based) for MC / TF / SA. */
  question?: number;
  /** TF statement letter (a–d) or SA character column index. */
  sub?: string;
  bubbles: OmrBubble[];
}

export interface OmrTextLabel {
  text: string;
  x: number;
  y: number;
  size: number;
  bold?: boolean;
}

export interface OmrTemplateDef {
  id: OmrTemplateId;
  mcCount: number;
  tfCount: number;
  saCount: number;
  groups: OmrBubbleGroup[];
  labels: OmrTextLabel[];
  /** Where the PDF prints the student name / SBD text when pre-filling. */
  nameAt: { x: number; y: number };
  sbdTextAt: { x: number; y: number };
}

export const MC_CHOICES = ["A", "B", "C", "D"] as const;
export const TF_STATEMENTS = ["a", "b", "c", "d"] as const;
export const SA_SYMBOLS = ["-", ",", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
export const SA_COLUMNS = 4;
export const SBD_DIGITS = 6;
export const VARIANT_DIGITS = 3;

function bubble(value: string, x: number, y: number): OmrBubble {
  return { value, x, y, u: x / OMR_CANONICAL_WIDTH, v: y / OMR_CANONICAL_HEIGHT };
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** SBD (6 digit columns) + exam code (3 digit columns) grids in the header. */
function headerGroups(groups: OmrBubbleGroup[], labels: OmrTextLabel[]) {
  const rowY = (d: number) => 150 + d * 26;
  const sbdX = (c: number) => 110 + c * 30;
  const varX = (c: number) => 360 + c * 30;

  labels.push({ text: "SBD / Student No.", x: 95, y: 100, size: 9, bold: true });
  labels.push({ text: "Mã đề / Code", x: 345, y: 100, size: 9, bold: true });
  for (let d = 0; d < 10; d++) {
    labels.push({ text: String(d), x: 78, y: rowY(d), size: 8 });
    labels.push({ text: String(d), x: 328, y: rowY(d), size: 8 });
  }
  for (let c = 0; c < SBD_DIGITS; c++) {
    groups.push({
      key: `sbd:${c}`,
      kind: "SBD",
      sub: String(c),
      bubbles: DIGITS.map((d, i) => bubble(d, sbdX(c), rowY(i))),
    });
  }
  for (let c = 0; c < VARIANT_DIGITS; c++) {
    groups.push({
      key: `variant:${c}`,
      kind: "VARIANT",
      sub: String(c),
      bubbles: DIGITS.map((d, i) => bubble(d, varX(c), rowY(i))),
    });
  }
  labels.push({ text: "Họ tên / Name: ....................................................", x: 480, y: 150, size: 10 });
  labels.push({ text: "Lớp / Class: .........................................................", x: 480, y: 190, size: 10 });
  labels.push({ text: "Tô kín 1 ô / Fill one bubble completely.", x: 480, y: 250, size: 9 });
  labels.push({ text: "Dùng bút chì 2B hoặc bút đen. / Use a 2B pencil or black pen.", x: 480, y: 275, size: 9 });
}

function mcBlock(
  groups: OmrBubbleGroup[],
  labels: OmrTextLabel[],
  opts: { count: number; startQuestion: number; cols: number; top: number; rowGap: number; left?: number; width?: number }
) {
  const left = opts.left ?? 60;
  const width = opts.width ?? 900;
  const colW = width / opts.cols;
  const rows = Math.ceil(opts.count / opts.cols);
  for (let c = 0; c < opts.cols; c++) {
    const x0 = left + c * colW;
    MC_CHOICES.forEach((ch, i) => labels.push({ text: ch, x: x0 + 66 + i * 46, y: opts.top - 4, size: 9, bold: true }));
  }
  for (let i = 0; i < opts.count; i++) {
    const c = Math.floor(i / rows);
    const r = i % rows;
    const x0 = left + c * colW;
    const y = opts.top + 26 + r * opts.rowGap;
    const q = opts.startQuestion + i;
    labels.push({ text: `${q}.`, x: x0 + 8, y, size: 10, bold: true });
    groups.push({
      key: `mc:${q}`,
      kind: "MC",
      question: q,
      bubbles: MC_CHOICES.map((ch, k) => bubble(ch, x0 + 70 + k * 46, y)),
    });
  }
}

function buildMc(id: OmrTemplateId, count: number, cols: number): OmrTemplateDef {
  const groups: OmrBubbleGroup[] = [];
  const labels: OmrTextLabel[] = [];
  headerGroups(groups, labels);
  const rows = Math.ceil(count / cols);
  const rowGap = Math.min(46, Math.floor(860 / rows));
  labels.push({ text: "TRẢ LỜI TRẮC NGHIỆM / ANSWERS", x: 60, y: 440, size: 11, bold: true });
  mcBlock(groups, labels, { count, startQuestion: 1, cols, top: 480, rowGap });
  return {
    id,
    mcCount: count,
    tfCount: 0,
    saCount: 0,
    groups,
    labels,
    nameAt: { x: 640, y: 124 },
    sbdTextAt: { x: 110, y: 125 },
  };
}

function buildThpt2025(): OmrTemplateDef {
  const groups: OmrBubbleGroup[] = [];
  const labels: OmrTextLabel[] = [];
  headerGroups(groups, labels);

  // Part I: 12 four-choice questions (3 columns × 4 rows)
  labels.push({ text: "PHẦN I / PART I (trắc nghiệm / multiple choice)", x: 60, y: 440, size: 11, bold: true });
  mcBlock(groups, labels, { count: 12, startQuestion: 1, cols: 3, top: 476, rowGap: 40 });

  // Part II: 4 questions × 4 true/false statements
  labels.push({ text: "PHẦN II / PART II (Đúng – Sai / True – False)", x: 60, y: 660, size: 11, bold: true });
  for (let q = 1; q <= 4; q++) {
    const x0 = 60 + (q - 1) * 225;
    labels.push({ text: `Câu ${q}`, x: x0 + 8, y: 696, size: 10, bold: true });
    labels.push({ text: "Đ", x: x0 + 75, y: 722, size: 9, bold: true });
    labels.push({ text: "S", x: x0 + 125, y: 722, size: 9, bold: true });
    TF_STATEMENTS.forEach((st, k) => {
      const y = 752 + k * 38;
      labels.push({ text: `${st})`, x: x0 + 20, y, size: 10 });
      groups.push({
        key: `tf:${q}:${st}`,
        kind: "TF",
        question: q,
        sub: st,
        bubbles: [bubble("T", x0 + 80, y), bubble("F", x0 + 130, y)],
      });
    });
  }

  // Part III: 6 short answers, 4 character columns each (- , 0-9)
  labels.push({ text: "PHẦN III / PART III (trả lời ngắn / short answer)", x: 60, y: 925, size: 11, bold: true });
  for (let q = 1; q <= 6; q++) {
    const x0 = 60 + (q - 1) * 150;
    labels.push({ text: `Câu ${q}`, x: x0 + 34, y: 958, size: 10, bold: true });
    for (let c = 0; c < SA_COLUMNS; c++) {
      groups.push({
        key: `sa:${q}:${c}`,
        kind: "SA",
        question: q,
        sub: String(c),
        bubbles: SA_SYMBOLS.map((sym, k) => bubble(sym, x0 + 40 + c * 28, 990 + k * 32)),
      });
    }
    SA_SYMBOLS.forEach((sym, k) => labels.push({ text: sym, x: x0 + 12, y: 990 + k * 32, size: 8 }));
  }

  return {
    id: "THPT_2025",
    mcCount: 12,
    tfCount: 4,
    saCount: 6,
    groups,
    labels,
    nameAt: { x: 640, y: 124 },
    sbdTextAt: { x: 110, y: 125 },
  };
}

const cache = new Map<OmrTemplateId, OmrTemplateDef>();

export function getOmrTemplate(id: OmrTemplateId): OmrTemplateDef {
  let t = cache.get(id);
  if (!t) {
    t =
      id === "MC_20"
        ? buildMc("MC_20", 20, 2)
        : id === "MC_40"
          ? buildMc("MC_40", 40, 2)
          : id === "MC_50"
            ? buildMc("MC_50", 50, 3)
            : buildThpt2025();
    cache.set(id, t);
  }
  return t;
}

export const OMR_TEMPLATE_IDS: OmrTemplateId[] = ["MC_20", "MC_40", "MC_50", "THPT_2025"];
