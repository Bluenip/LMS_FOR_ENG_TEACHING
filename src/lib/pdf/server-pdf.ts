import { AppError } from "@/lib/errors";

export interface ParsedPdfPage {
  pageIndex: number;
  widthPt: number;
  heightPt: number;
}

export interface ParsedPdfMetadata {
  pageCount: number;
  pages: ParsedPdfPage[];
}

export function getMaxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_SIZE_MB ?? "20");
  const safeMb = Number.isFinite(mb) && mb > 0 ? mb : 20;
  return safeMb * 1024 * 1024;
}

/**
 * Verifies PDF magic bytes (%PDF-) and size limit.
 */
export function validatePdfBuffer(buffer: Buffer, mimeType?: string): void {
  const maxBytes = getMaxUploadBytes();
  if (buffer.byteLength === 0) {
    throw new AppError("File PDF trống.", 400, "EMPTY_FILE");
  }
  if (buffer.byteLength > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    throw new AppError(`File vượt quá dung lượng tối đa ${maxMb}MB.`, 400, "FILE_TOO_LARGE");
  }
  if (mimeType && mimeType !== "application/pdf" && mimeType !== "application/octet-stream") {
    throw new AppError("Chỉ chấp nhận định dạng file PDF (application/pdf).", 400, "INVALID_MIME");
  }
  // Check magic header "%PDF" (allow small leading whitespace if present within first 1024 bytes, though standard is byte 0)
  const header = buffer.subarray(0, 5).toString("ascii");
  if (!header.startsWith("%PDF")) {
    throw new AppError("File không phải là PDF hợp lệ (sai magic bytes %PDF).", 400, "INVALID_PDF_MAGIC");
  }
}

/**
 * Parses PDF page count and exact page dimensions (in PDF points) using pdfjs-dist on server.
 */
export async function parsePdfMetadata(buffer: Buffer): Promise<ParsedPdfMetadata> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  });

  const pdfDoc = await loadingTask.promise;
  try {
    const pageCount = pdfDoc.numPages;
    const pages: ParsedPdfPage[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      pages.push({
        pageIndex: i - 1,
        widthPt: Math.round(viewport.width * 100) / 100,
        heightPt: Math.round(viewport.height * 100) / 100,
      });
    }
    return { pageCount, pages };
  } finally {
    await pdfDoc.destroy();
  }
}
