import { solveHomography8pt, warpGray, type GrayImage, type Point } from "./perspective-warp";
import {
  OMR_BUBBLE_RADIUS,
  OMR_CANONICAL_HEIGHT,
  OMR_CANONICAL_WIDTH,
  OMR_FIDUCIAL_SIZE,
  getOmrTemplate,
  type OmrTemplateId,
} from "./templates";

/** A mark on a bubble: value of the bubble and darkness (0 = black ink, ~150 = faint pencil). */
export type SyntheticMark = { value: string; ink?: number };

const MARGIN = 70;

/**
 * Renders a flat answer sheet (with fiducials, bubble outlines and marks) and optionally photographs
 * it in perspective: `photo.corners` are where the 4 fiducial centres land in the output image.
 * Used by unit tests, the seed and E2E fixtures (no real camera needed).
 */
export function renderSyntheticSheet(opts: {
  template: OmrTemplateId;
  marks: Record<string, SyntheticMark | SyntheticMark[]>;
  photo?: { width: number; height: number; corners: [Point, Point, Point, Point]; paper?: number };
}): GrayImage {
  const W = OMR_CANONICAL_WIDTH + MARGIN * 2;
  const H = OMR_CANONICAL_HEIGHT + MARGIN * 2;
  const data = new Uint8ClampedArray(W * H).fill(opts.photo?.paper ?? 250);
  const set = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) data[y * W + x] = Math.min(data[y * W + x]!, v);
  };

  const half = OMR_FIDUCIAL_SIZE / 2;
  for (const [cx, cy] of [
    [0, 0],
    [OMR_CANONICAL_WIDTH, 0],
    [OMR_CANONICAL_WIDTH, OMR_CANONICAL_HEIGHT],
    [0, OMR_CANONICAL_HEIGHT],
  ] as const) {
    for (let y = -half; y < half; y++) for (let x = -half; x < half; x++) set(MARGIN + cx + x, MARGIN + cy + y, 10);
  }

  const r = OMR_BUBBLE_RADIUS;
  const t = getOmrTemplate(opts.template);
  for (const g of t.groups) {
    const raw = opts.marks[g.key];
    const marks = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
    for (const b of g.bubbles) {
      const mark = marks.find((m) => m.value === b.value);
      const cx = MARGIN + b.x;
      const cy = MARGIN + b.y;
      for (let y = -r - 2; y <= r + 2; y++) {
        for (let x = -r - 2; x <= r + 2; x++) {
          const d = Math.hypot(x, y);
          if (Math.abs(d - r) <= 0.9) set(Math.round(cx + x), Math.round(cy + y), 90);
          else if (mark && d < r - 1) set(Math.round(cx + x), Math.round(cy + y), mark.ink ?? 25);
        }
      }
    }
  }
  const flat: GrayImage = { width: W, height: H, data };
  if (!opts.photo) return flat;

  const canonicalInRaster: Point[] = [
    { x: MARGIN, y: MARGIN },
    { x: MARGIN + OMR_CANONICAL_WIDTH, y: MARGIN },
    { x: MARGIN + OMR_CANONICAL_WIDTH, y: MARGIN + OMR_CANONICAL_HEIGHT },
    { x: MARGIN, y: MARGIN + OMR_CANONICAL_HEIGHT },
  ];
  const Hm = solveHomography8pt(opts.photo.corners, canonicalInRaster);
  const photo = warpGray(flat, Hm, opts.photo.width, opts.photo.height);
  // Make the area outside the paper a light grey table (not pure white).
  return photo;
}

/** Marks for a full answer set: { "mc:1": "B", "sbd:0": "1", "tf:1:a": "T", ... }. */
export function marksFromValues(values: Record<string, string>, ink = 25): Record<string, SyntheticMark> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v, ink }]));
}

/** Bubble marks for a 6-digit SBD and a 3-digit exam code. */
export function idMarks(sbd: string, variant?: string): Record<string, string> {
  const out: Record<string, string> = {};
  sbd.split("").forEach((d, i) => (out[`sbd:${i}`] = d));
  variant?.split("").forEach((d, i) => (out[`variant:${i}`] = d));
  return out;
}
