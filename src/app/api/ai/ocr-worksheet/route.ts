import { NextResponse } from "next/server";
import type { WorksheetSubject } from "@prisma/client";
import { handleApiError, requireRole } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { WORKSHEET_SUBJECTS } from "@/lib/subjects";
import { OCR_MAX_IMAGES } from "@/lib/ai/ocr-prompt";
import { OCR_MAX_IMAGE_BYTES, extractQuestionsFromImages } from "@/server/aiOcrService";

/** multipart/form-data: `images` (1–5 JPG/PNG/WebP, ≤ 6MB each) + optional `subject`. */
export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const form = await req.formData();
    const files = form.getAll("images").filter((f): f is File => f instanceof File);
    if (files.length === 0 || files.length > OCR_MAX_IMAGES) {
      throw new AppError("Hãy chọn từ 1 đến 5 ảnh đề.", 400, "OCR_IMAGE_COUNT");
    }
    if (files.some((f) => f.size > OCR_MAX_IMAGE_BYTES)) {
      throw new AppError("Mỗi ảnh đề tối đa 6MB.", 400, "OCR_IMAGE_TOO_LARGE");
    }
    const rawSubject = form.get("subject");
    const subject =
      typeof rawSubject === "string" && (WORKSHEET_SUBJECTS as readonly string[]).includes(rawSubject)
        ? (rawSubject as WorksheetSubject)
        : null;
    const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
    return NextResponse.json(await extractQuestionsFromImages(user, buffers, { subject }));
  } catch (error) {
    return handleApiError(error);
  }
}
