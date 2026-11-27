import { OMR_CANONICAL_HEIGHT, OMR_CANONICAL_WIDTH } from "./templates";

/** Same shape as the browser `ImageData` (RGBA) so it runs on Canvas and in Node/Vitest. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** One luminance byte per pixel. */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Point {
  x: number;
  y: number;
}

export type Homography = [number, number, number, number, number, number, number, number, number];

export class OmrWarpError extends Error {
  constructor(public readonly code: "FIDUCIALS_NOT_FOUND" | "DEGENERATE") {
    super(code);
    this.name = "OmrWarpError";
  }
}

export function toGrayscale(img: RgbaImage): GrayImage {
  const out = new Uint8ClampedArray(img.width * img.height);
  const d = img.data;
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    out[p] = (d[i]! * 299 + d[i + 1]! * 587 + d[i + 2]! * 114) / 1000;
  }
  return { width: img.width, height: img.height, data: out };
}

export function grayToRgba(img: GrayImage): RgbaImage {
  const out = new Uint8ClampedArray(img.width * img.height * 4);
  for (let p = 0, i = 0; p < img.data.length; p++, i += 4) {
    const g = img.data[p]!;
    out[i] = g;
    out[i + 1] = g;
    out[i + 2] = g;
    out[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

/** Luminance at the given percentile (0..1) using a 256-bin histogram. */
export function grayPercentile(img: GrayImage, pct: number, region?: { x0: number; y0: number; x1: number; y1: number }): number {
  const hist = new Uint32Array(256);
  let n = 0;
  const x0 = Math.max(0, Math.floor(region?.x0 ?? 0));
  const y0 = Math.max(0, Math.floor(region?.y0 ?? 0));
  const x1 = Math.min(img.width, Math.ceil(region?.x1 ?? img.width));
  const y1 = Math.min(img.height, Math.ceil(region?.y1 ?? img.height));
  const step = (x1 - x0) * (y1 - y0) > 400_000 ? 2 : 1;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      hist[img.data[y * img.width + x]!]!++;
      n++;
    }
  }
  if (n === 0) return 255;
  const target = pct * n;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= target) return v;
  }
  return 255;
}

/** Nearest-neighbour downscale so the longest side is ≤ maxSide (returns the factor used). */
function downscale(img: GrayImage, maxSide: number): { img: GrayImage; factor: number } {
  const longest = Math.max(img.width, img.height);
  if (longest <= maxSide) return { img, factor: 1 };
  const factor = longest / maxSide;
  const w = Math.max(1, Math.round(img.width / factor));
  const h = Math.max(1, Math.round(img.height / factor));
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y * factor));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x * factor));
      out[y * w + x] = img.data[sy * img.width + sx]!;
    }
  }
  return { img: { width: w, height: h, data: out }, factor };
}

interface Blob {
  area: number;
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  touchesBorder: boolean;
}

function darkBlobs(img: GrayImage, threshold: number): Blob[] {
  const { width: w, height: h, data } = img;
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const blobs: Blob[] = [];
  let next = 1;
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== 0 || data[start]! >= threshold) continue;
    let sp = 0;
    stack[sp++] = start;
    label[start] = next;
    const b: Blob = { area: 0, cx: 0, cy: 0, minX: w, minY: h, maxX: 0, maxY: 0, touchesBorder: false };
    while (sp > 0) {
      const p = stack[--sp]!;
      const x = p % w;
      const y = (p - x) / w;
      b.area++;
      b.cx += x;
      b.cy += y;
      if (x < b.minX) b.minX = x;
      if (y < b.minY) b.minY = y;
      if (x > b.maxX) b.maxX = x;
      if (y > b.maxY) b.maxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) b.touchesBorder = true;
      const nbrs = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nbrs) {
        if (q >= 0 && label[q] === 0 && data[q]! < threshold) {
          label[q] = next;
          stack[sp++] = q;
        }
      }
    }
    b.cx /= b.area;
    b.cy /= b.area;
    blobs.push(b);
    next++;
  }
  return blobs;
}

/**
 * Finds the centres of the 4 fiducial squares (TL, TR, BR, BL) in image coordinates.
 * The fiducial is the largest compact, solid dark blob in each quadrant that does not touch the
 * image border (a dark table around the paper does).
 */
export function findFiducials(gray: GrayImage): [Point, Point, Point, Point] {
  const { img, factor } = downscale(gray, 900);
  const paper = grayPercentile(img, 0.9);
  const blobs = darkBlobs(img, Math.max(40, paper * 0.5));
  const minArea = Math.max(12, (img.width * img.height) / 8000);
  const maxArea = (img.width * img.height) / 60;

  const candidates = blobs.filter((b) => {
    if (b.touchesBorder || b.area < minArea || b.area > maxArea) return false;
    const bw = b.maxX - b.minX + 1;
    const bh = b.maxY - b.minY + 1;
    const aspect = bw / bh;
    return aspect > 0.5 && aspect < 2 && b.area / (bw * bh) > 0.55;
  });

  const quadrant = (qx: 0 | 1, qy: 0 | 1): Point => {
    const inQ = candidates.filter(
      (b) => (b.cx < img.width / 2 ? 0 : 1) === qx && (b.cy < img.height / 2 ? 0 : 1) === qy
    );
    if (inQ.length === 0) throw new OmrWarpError("FIDUCIALS_NOT_FOUND");
    const biggest = Math.max(...inQ.map((b) => b.area));
    // Among blobs of fiducial size, take the one closest to the image corner.
    const corner = { x: qx ? img.width : 0, y: qy ? img.height : 0 };
    const best = inQ
      .filter((b) => b.area >= biggest * 0.6)
      .sort((a, b) => Math.hypot(a.cx - corner.x, a.cy - corner.y) - Math.hypot(b.cx - corner.x, b.cy - corner.y))[0]!;
    return { x: (best.cx + 0.5) * factor - 0.5, y: (best.cy + 0.5) * factor - 0.5 };
  };

  return [quadrant(0, 0), quadrant(1, 0), quadrant(1, 1), quadrant(0, 1)];
}

/**
 * Solves the 3×3 homography H (h33 = 1) mapping 4 source points onto 4 destination points
 * (8 linear equations, Gaussian elimination with partial pivoting).
 */
export function solveHomography8pt(src: Point[], dst: Point[]): Homography {
  if (src.length !== 4 || dst.length !== 4) throw new OmrWarpError("DEGENERATE");
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: X, y: Y } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X, X]);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y, Y]);
  }
  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[pivot]![col]!)) pivot = r;
    if (Math.abs(A[pivot]![col]!) < 1e-10) throw new OmrWarpError("DEGENERATE");
    [A[col], A[pivot]] = [A[pivot]!, A[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r]![col]! / A[col]![col]!;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) A[r]![c]! -= f * A[col]![c]!;
    }
  }
  const h = A.map((row, i) => row[n]! / row[i]!);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function applyHomography(H: Homography, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

export const CANONICAL_CORNERS: [Point, Point, Point, Point] = [
  { x: 0, y: 0 },
  { x: OMR_CANONICAL_WIDTH, y: 0 },
  { x: OMR_CANONICAL_WIDTH, y: OMR_CANONICAL_HEIGHT },
  { x: 0, y: OMR_CANONICAL_HEIGHT },
];

/** Bilinear resample of `gray` through H (output coords → source coords). Outside pixels are white. */
export function warpGray(gray: GrayImage, H: Homography, width: number, height: number): GrayImage {
  const out = new Uint8ClampedArray(width * height);
  const { width: sw, height: sh, data } = gray;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = H[6] * x + H[7] * y + H[8];
      const sx = (H[0] * x + H[1] * y + H[2]) / w;
      const sy = (H[3] * x + H[4] * y + H[5]) / w;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) {
        out[y * width + x] = 255;
        continue;
      }
      const fx = sx - x0;
      const fy = sy - y0;
      const i = y0 * sw + x0;
      const top = data[i]! * (1 - fx) + data[i + 1]! * fx;
      const bottom = data[i + sw]! * (1 - fx) + data[i + sw + 1]! * fx;
      out[y * width + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return { width, height, data: out };
}

/**
 * Full pipeline: grayscale → locate fiducials → homography → flatten to the canonical 1000×1414 sheet.
 */
export function warpToCanonical(img: RgbaImage | GrayImage): { gray: GrayImage; corners: Point[] } {
  const gray = img.data.length === img.width * img.height * 4 ? toGrayscale(img) : (img as GrayImage);
  const corners = findFiducials(gray);
  const H = solveHomography8pt(CANONICAL_CORNERS, corners);
  return { gray: warpGray(gray, H, OMR_CANONICAL_WIDTH, OMR_CANONICAL_HEIGHT), corners };
}
