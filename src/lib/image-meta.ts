export interface DetectedImageMeta {
  ext: ".jpg" | ".png" | ".webp";
  mime: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
}

function isValidDims(w: number, h: number): boolean {
  return Number.isInteger(w) && Number.isInteger(h) && w >= 1 && h >= 1 && w <= 20000 && h <= 20000;
}

/**
 * Inspects image magic bytes (JPEG/PNG/WebP) and parses exact pixel dimensions
 * directly from binary headers with zero native dependencies.
 */
export function detectImageMeta(buffer: Buffer): DetectedImageMeta | null {
  if (!buffer || buffer.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (!isValidDims(width, height)) return null;
    return { ext: ".png", mime: "image/png", width, height };
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 30 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    const chunk = buffer.subarray(12, 16).toString("ascii");
    if (
      chunk === "VP8 " &&
      buffer[23] === 0x9d &&
      buffer[24] === 0x01 &&
      buffer[25] === 0x2a
    ) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      if (!isValidDims(width, height)) return null;
      return { ext: ".webp", mime: "image/webp", width, height };
    }
    if (chunk === "VP8L" && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      if (!isValidDims(width, height)) return null;
      return { ext: ".webp", mime: "image/webp", width, height };
    }
    if (chunk === "VP8X") {
      const width = 1 + (buffer[24]! | (buffer[25]! << 8) | (buffer[26]! << 16));
      const height = 1 + (buffer[27]! | (buffer[28]! << 8) | (buffer[29]! << 16));
      if (!isValidDims(width, height)) return null;
      return { ext: ".webp", mime: "image/webp", width, height };
    }
    return null;
  }

  // JPEG: FF D8 FF ... SOF0..SOF15
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    let offset = 2;
    while (offset + 4 <= buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      while (offset < buffer.length && buffer[offset] === 0xff) {
        offset++;
      }
      if (offset >= buffer.length) break;
      const marker = buffer[offset]!;
      offset++;

      if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS
      if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) {
        continue;
      }
      if (offset + 2 > buffer.length) break;
      const segLen = buffer.readUInt16BE(offset);
      if (segLen < 2 || offset + segLen > buffer.length) break;

      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSof && segLen >= 7) {
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        if (!isValidDims(width, height)) return null;
        return { ext: ".jpg", mime: "image/jpeg", width, height };
      }

      offset += segLen;
    }
  }

  return null;
}

/**
 * Normalizes an uploaded image page to A4 reference width (595pt) so overlay
 * coordinates (0..1) and typography scale match PDF-backed worksheets identically.
 */
export function normalizeImagePagePt(
  width: number,
  height: number
): { widthPt: number; heightPt: number } {
  const safeW = Number.isFinite(width) && width > 0 ? width : 595;
  const safeH = Number.isFinite(height) && height > 0 ? height : 842;
  const rawHeightPt = Math.round(((595 * safeH) / safeW) * 100) / 100;
  return {
    widthPt: 595,
    heightPt: Math.max(200, Math.min(2000, rawHeightPt)),
  };
}
