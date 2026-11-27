import crypto from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AppError, handleApiError, requireRole } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { getStorageProvider } from "@/lib/storage";
import { getServerDeadline } from "@/server/submissionService";
import { enqueueDriveTrashForKeys } from "@/server/driveService";
import { isSubmissionParticipant } from "@/server/classGroupService";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per image / PDF

type DetectedUploadFile = {
  ext: ".jpg" | ".png" | ".webp" | ".pdf" | ".webm" | ".ogg" | ".m4a" | ".wav";
  mime: string;
  category: "IMAGE_OR_PDF" | "PNG_ONLY" | "AUDIO";
};

function detectFileSignature(buffer: Buffer): DetectedUploadFile | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: ".jpg", mime: "image/jpeg", category: "IMAGE_OR_PDF" };
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: ".png", mime: "image/png", category: "PNG_ONLY" };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { ext: ".webp", mime: "image/webp", category: "IMAGE_OR_PDF" };
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { ext: ".pdf", mime: "application/pdf", category: "IMAGE_OR_PDF" };
  }
  // WebM / Matroska EBML header (1A 45 DF A3)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return { ext: ".webm", mime: "audio/webm", category: "AUDIO" };
  }
  // OGG container header ("OggS")
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "OggS") {
    return { ext: ".ogg", mime: "audio/ogg", category: "AUDIO" };
  }
  // MP4 / M4A container header ("ftyp" at offset 4)
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return { ext: ".m4a", mime: "audio/mp4", category: "AUDIO" };
  }
  // WAV container header ("RIFF"..."WAVE")
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return { ext: ".wav", mime: "audio/wav", category: "AUDIO" };
  }
  return null;
}

function sanitizeFileName(rawName: string | undefined, fallbackExt: string): string {
  const base = path
    .basename(rawName || "")
    .replace(/[\r\n\0/\\]+/g, "_")
    .trim()
    .slice(0, 120);
  if (!base) return `bai-lam${fallbackExt}`;
  return base;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["STUDENT"]);
    const { id: submissionId } = await context.params;

    const rl = checkRateLimit(`sub-file:${submissionId}`, 30, 60_000);
    if (!rl.allowed) {
      throw new AppError("Bạn tải file lên quá nhanh, vui lòng thử lại sau ít giây.", 429, "RATE_LIMITED");
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        studentId: true,
        status: true,
        lockedAt: true,
        startedAt: true,
        student: { select: { name: true } },
        assignment: {
          select: {
            id: true,
            title: true,
            classId: true,
            timeLimitMin: true,
            dueAt: true,
            allowLate: true,
            class: { select: { name: true, teacherId: true, deletedAt: true } },
            worksheet: {
              select: {
                id: true,
                fields: { select: { id: true, type: true } },
              },
            },
          },
        },
      },
    });

    if (!submission || !(await isSubmissionParticipant(submission, user.id)) || submission.assignment.class.deletedAt) {
      throw new AppError("Không tìm thấy bài làm.", 404, "NOT_FOUND");
    }
    if (submission.status !== "IN_PROGRESS") {
      throw new AppError("Bài làm đã nộp, không thể tải thêm ảnh.", 409, "ALREADY_SUBMITTED");
    }
    if (submission.lockedAt) {
      throw new AppError("Bài làm đang bị khoá, không thể tải file.", 423, "SUBMISSION_LOCKED");
    }
    const deadline = getServerDeadline(submission, submission.assignment);
    if (deadline && new Date() >= deadline) {
      throw new AppError("Đã hết thời gian làm bài.", 409, "TIME_EXPIRED");
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const fieldIdRaw = formData.get("fieldId");
    const fieldId = typeof fieldIdRaw === "string" ? fieldIdRaw.trim() : "";

    if (!(file instanceof File)) {
      throw new AppError("Vui lòng chọn ảnh hoặc file PDF để tải lên.", 400, "MISSING_FILE");
    }
    const targetField = submission.assignment.worksheet.fields.find((f) => f.id === fieldId);
    if (
      !targetField ||
      (targetField.type !== "PHOTO_UPLOAD" &&
        targetField.type !== "DRAW" &&
        targetField.type !== "VOICE_ANSWER" &&
        targetField.type !== "SPEAKING")
    ) {
      throw new AppError("Câu hỏi này không hỗ trợ tải file bài làm.", 400, "INVALID_FIELD");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      throw new AppError("File rỗng.", 400, "EMPTY_FILE");
    }
    if (buffer.length > MAX_FILE_BYTES) {
      throw new AppError("Dung lượng file tối đa 10MB.", 413, "FILE_TOO_LARGE");
    }

    const detected = detectFileSignature(buffer);
    if (!detected) {
      throw new AppError(
        targetField.type === "DRAW"
          ? "Chỉ hỗ trợ ảnh PNG từ khung vẽ."
          : targetField.type === "VOICE_ANSWER" || targetField.type === "SPEAKING"
            ? "Chỉ hỗ trợ file ghi âm (WebM, OGG, MP4/M4A hoặc WAV)."
            : "Chỉ hỗ trợ ảnh (JPEG, PNG, WebP) hoặc file PDF hợp lệ.",
        400,
        "INVALID_FILE_TYPE"
      );
    }

    if (targetField.type === "DRAW" && detected.category !== "PNG_ONLY") {
      throw new AppError("Chỉ hỗ trợ ảnh PNG từ khung vẽ.", 400, "INVALID_FILE_TYPE");
    }
    if (
      (targetField.type === "VOICE_ANSWER" || targetField.type === "SPEAKING") &&
      detected.category !== "AUDIO"
    ) {
      throw new AppError(
        "Chỉ hỗ trợ file ghi âm (WebM, OGG, MP4/M4A hoặc WAV).",
        400,
        "INVALID_FILE_TYPE"
      );
    }
    if (
      targetField.type === "PHOTO_UPLOAD" &&
      detected.category === "AUDIO"
    ) {
      throw new AppError(
        "Chỉ hỗ trợ ảnh (JPEG, PNG, WebP) hoặc file PDF hợp lệ.",
        400,
        "INVALID_FILE_TYPE"
      );
    }

    const safeName = sanitizeFileName(file.name, detected.ext);
    const key = `submissions/${submissionId}/${fieldId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}${detected.ext}`;

    await getStorageProvider().put(key, buffer, detected.mime, {
      ownerId: submission.assignment.class.teacherId,
      kind: "SUBMISSION_FILE",
      worksheetId: submission.assignment.worksheet.id,
      classId: submission.assignment.classId,
      className: submission.assignment.class.name,
      assignmentTitle: submission.assignment.title,
      studentName: submission.student.name,
      submissionId: submission.id,
      fileName: safeName,
    });

    return NextResponse.json(
      {
        file: {
          key,
          name: safeName,
          mimeType: detected.mime,
          sizeBytes: buffer.length,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["STUDENT"]);
    const { id: submissionId } = await context.params;
    const body = (await req.json().catch(() => ({}))) as { key?: unknown };
    const key = typeof body.key === "string" ? body.key.trim() : "";

    if (!key || key.includes("..") || !key.startsWith(`submissions/${submissionId}/`)) {
      throw new AppError("Đường dẫn file không hợp lệ.", 400, "INVALID_KEY");
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, studentId: true, groupId: true, status: true, lockedAt: true },
    });
    if (!submission || !(await isSubmissionParticipant(submission, user.id))) {
      throw new AppError("Không tìm thấy bài làm.", 404, "NOT_FOUND");
    }
    if (submission.status !== "IN_PROGRESS" || submission.lockedAt) {
      throw new AppError("Không thể xoá file khi bài đã nộp hoặc đang bị khoá.", 409, "FORBIDDEN");
    }

    const queued = await enqueueDriveTrashForKeys([key], "STUDENT_REMOVED_FILE");
    if (queued === 0) {
      await getStorageProvider().delete(key).catch(() => undefined);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
