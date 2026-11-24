import crypto from "node:crypto";
import type { LessonItemType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getStorageProvider } from "@/lib/storage";
import { getMaxUploadBytes, validatePdfBuffer } from "@/lib/pdf/server-pdf";

const ALLOWED_MEDIA_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
};

export async function listClassLessons(classId: string) {
  return prisma.lesson.findMany({
    where: { classId },
    include: {
      items: { orderBy: { order: "asc" } },
    },
    orderBy: { order: "asc" },
  });
}

export async function createLesson(
  classId: string,
  input: { title: string; description?: string | null; order?: number }
) {
  const count = await prisma.lesson.count({ where: { classId } });
  return prisma.lesson.create({
    data: {
      classId,
      title: input.title,
      description: input.description ?? null,
      order: input.order ?? count,
    },
    include: { items: true },
  });
}

export async function deleteLesson(classId: string, lessonId: string) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, classId },
    include: { items: true },
  });
  if (!lesson) {
    throw new AppError("Không tìm thấy chương bài giảng.", 404, "NOT_FOUND");
  }
  await prisma.lesson.delete({ where: { id: lesson.id } });
  const storage = getStorageProvider();
  for (const item of lesson.items) {
    if (item.fileKey) {
      await storage.delete(item.fileKey).catch(() => undefined);
    }
  }
}

export async function createLessonItem(
  classId: string,
  lessonId: string,
  input: {
    title: string;
    type: LessonItemType;
    url?: string | null;
    fileKey?: string | null;
    order?: number;
  }
) {
  const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, classId } });
  if (!lesson) {
    throw new AppError("Không tìm thấy chương bài giảng.", 404, "NOT_FOUND");
  }
  const count = await prisma.lessonItem.count({ where: { lessonId } });
  return prisma.lessonItem.create({
    data: {
      lessonId,
      title: input.title,
      type: input.type,
      url: input.url?.trim() || null,
      fileKey: input.fileKey?.trim() || null,
      order: input.order ?? count,
    },
  });
}

export async function uploadLessonAttachment(
  classId: string,
  lessonId: string,
  buffer: Buffer,
  mimeType: string
) {
  const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, classId } });
  if (!lesson) {
    throw new AppError("Không tìm thấy chương bài giảng.", 404, "NOT_FOUND");
  }

  const maxBytes = getMaxUploadBytes();
  if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) {
    throw new AppError("Kích thước file không hợp lệ hoặc vượt quá giới hạn.", 400, "INVALID_SIZE");
  }

  const ext = ALLOWED_MEDIA_EXT[mimeType];
  if (!ext) {
    throw new AppError(
      "Định dạng file không được hỗ trợ (chỉ nhận PDF, MP4, WebM, MP3, WAV, OGG, M4A).",
      400,
      "INVALID_MIME"
    );
  }

  if (mimeType === "application/pdf") {
    validatePdfBuffer(buffer, mimeType);
  }

  const fileKey = `lessons/${classId}/${lessonId}/${crypto.randomUUID()}${ext}`;
  await getStorageProvider().put(fileKey, buffer, mimeType);
  return { fileKey };
}

export async function deleteLessonItem(classId: string, lessonId: string, itemId: string) {
  const item = await prisma.lessonItem.findFirst({
    where: { id: itemId, lessonId, lesson: { classId } },
  });
  if (!item) {
    throw new AppError("Không tìm thấy tài liệu.", 404, "NOT_FOUND");
  }
  await prisma.lessonItem.delete({ where: { id: item.id } });
  if (item.fileKey) {
    await getStorageProvider().delete(item.fileKey).catch(() => undefined);
  }
}
