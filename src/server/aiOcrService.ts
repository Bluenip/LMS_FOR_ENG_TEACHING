import type { WorksheetSubject } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { detectImageMeta } from "@/lib/image-meta";
import { OCR_MAX_IMAGES, buildOcrRequestBody, parseOcrQuestions, type OcrImagePart } from "@/lib/ai/ocr-prompt";
import { assertAiQuota, callGemini, logAiUsage, type GeminiDeps } from "./aiGeminiClient";

export const OCR_MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * Reads 1–5 photos of a paper exam with Gemini Vision and returns draft questions for the teacher to
 * review before anything is saved. Counts one AI use per call.
 */
export async function extractQuestionsFromImages(
  actor: { id: string; role: string },
  files: Buffer[],
  opts: { subject?: WorksheetSubject | null } = {},
  deps: GeminiDeps = {}
) {
  if (files.length === 0 || files.length > OCR_MAX_IMAGES) {
    throw new AppError("Hãy chọn từ 1 đến 5 ảnh đề.", 400, "OCR_IMAGE_COUNT");
  }
  const images: OcrImagePart[] = files.map((buf) => {
    if (buf.length === 0 || buf.length > OCR_MAX_IMAGE_BYTES) {
      throw new AppError("Mỗi ảnh đề tối đa 6MB.", 400, "OCR_IMAGE_TOO_LARGE");
    }
    const meta = detectImageMeta(buf);
    if (!meta) throw new AppError("Chỉ nhận ảnh JPG, PNG hoặc WebP.", 400, "OCR_IMAGE_INVALID");
    return { mimeType: meta.mime, data: buf.toString("base64") };
  });

  const { dayKey, used, limit } = await assertAiQuota(actor.id, deps.now);
  const result = await callGemini(buildOcrRequestBody(images, opts.subject ?? null), deps);
  const questions = parseOcrQuestions(result.text);
  if (questions.length === 0) {
    throw new AppError(
      "AI không đọc được câu hỏi nào từ ảnh. Hãy chụp rõ, thẳng và đủ sáng hơn.",
      422,
      "AI_INVALID_OUTPUT"
    );
  }
  await logAiUsage(actor.id, "OCR_WORKSHEET", dayKey, result.tokensUsed);
  return { questions, quota: { limit, used: used + 1, remaining: Math.max(0, limit - used - 1), dayKey } };
}
