export interface PdfTextItemLike {
  str: string;
  transform: number[];
  width: number;
  height?: number;
}

export interface NormalizedBoxLike {
  pageIndex?: number | null;
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
}

export interface DetectedPdfBlank {
  pageIndex: number;
  type: "TEXT" | "CHECKBOX";
  x: number;
  y: number;
  w: number;
  h: number;
  snippet: string;
}

const BLANK_LINE_RE = /_{3,}|\.{5,}|…{2,}/g;
const CHECKBOX_RE = /\[\s{0,6}\]|\(\s{1,6}\)|[☐□]/g;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export function computeBoxIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  if (interArea <= 0) return 0;
  const unionArea = a.w * a.h + b.w * b.h - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Scans pdfjs page text items and suggests normalized 0..1 OVERLAY boxes
 * for underscore/dot blanks (TEXT) and empty brackets/squares (CHECKBOX),
 * excluding candidates that overlap existing overlays (IoU > 0.3).
 */
export function detectPdfBlanks(
  textItems: PdfTextItemLike[],
  viewport: { width: number; height: number },
  pageIndex: number,
  existingOverlays: NormalizedBoxLike[] = []
): DetectedPdfBlank[] {
  const pageW = viewport.width > 0 ? viewport.width : 595;
  const pageH = viewport.height > 0 ? viewport.height : 842;

  const occupied: Array<{ x: number; y: number; w: number; h: number }> = existingOverlays
    .filter(
      (b) =>
        (b.pageIndex ?? 0) === pageIndex &&
        typeof b.x === "number" &&
        typeof b.y === "number" &&
        typeof b.w === "number" &&
        typeof b.h === "number"
    )
    .map((b) => ({ x: b.x!, y: b.y!, w: b.w!, h: b.h! }));

  const results: DetectedPdfBlank[] = [];

  for (const item of textItems) {
    const str = item.str ?? "";
    if (!str || str.length === 0) continue;
    const tx = item.transform[4] ?? 0;
    const ty = item.transform[5] ?? 0;
    const fontH = Math.max(8, Math.abs(item.height || item.transform[3] || 12));
    const totalW = Math.max(item.width || 0, fontH * 0.6 * str.length);

    const patterns: Array<{ re: RegExp; type: "TEXT" | "CHECKBOX" }> = [
      { re: CHECKBOX_RE, type: "CHECKBOX" },
      { re: BLANK_LINE_RE, type: "TEXT" },
    ];

    for (const pat of patterns) {
      pat.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pat.re.exec(str)) !== null) {
        const startFrac = m.index / str.length;
        const lenFrac = m[0].length / str.length;

        const rawX = (tx + totalW * startFrac) / pageW;
        const rawW =
          pat.type === "CHECKBOX"
            ? clamp((fontH * 1.4) / pageW, 0.025, 0.045)
            : clamp((totalW * lenFrac) / pageW, 0.045, 0.65);

        const rawH =
          pat.type === "CHECKBOX"
            ? clamp((fontH * 1.4) / pageH, 0.022, 0.042)
            : clamp((fontH * 1.6) / pageH, 0.026, 0.06);

        const rawY = (pageH - ty - fontH * 1.18) / pageH;

        const box = {
          x: round4(clamp(rawX, 0.01, 0.98 - rawW)),
          y: round4(clamp(rawY, 0.01, 0.98 - rawH)),
          w: round4(clamp(rawW, 0.02, 0.9)),
          h: round4(clamp(rawH, 0.02, 0.15)),
        };

        const overlaps = occupied.some((ex) => computeBoxIoU(box, ex) > 0.3);
        if (!overlaps) {
          occupied.push(box);
          results.push({
            pageIndex,
            type: pat.type,
            ...box,
            snippet: str.trim().slice(0, 80),
          });
        }
      }
    }
  }

  return results.sort((a, b) => a.y - b.y || a.x - b.x);
}
