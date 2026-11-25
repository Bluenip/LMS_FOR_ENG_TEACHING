import crypto from "node:crypto";
import type { LessonItemType, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getStorageProvider } from "@/lib/storage";
import { getMaxUploadBytes, validatePdfBuffer } from "@/lib/pdf/server-pdf";
import { enqueueDriveTrashForKeys } from "./driveService";

/**
 * Lesson library (Phase 14): a lesson (chapter + materials) belongs to its owner's library and is
 * shown in any number of classes through ClassLesson — the same idea as one worksheet given to
 * many classes. Editing a lesson updates every class that uses it.
 *
 * Who can do what:
 * - edit / delete a lesson and its materials: the owner, or an admin
 * - show a lesson in a class / remove it from a class: the class teacher (or admin), and only with
 *   lessons they own (admins: any lesson)
 */

type Actor = { id: string; role: Role };

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

const NOT_FOUND = () => new AppError("Không tìm thấy chương bài giảng.", 404, "NOT_FOUND");

/** Loads a lesson the actor may edit (owner or admin). */
export async function requireEditableLesson(actor: Actor, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, ownerId: true, classId: true, title: true, deletedAt: true },
  });
  if (!lesson || lesson.deletedAt) throw NOT_FOUND();
  if (actor.role !== "ADMIN" && lesson.ownerId !== actor.id) {
    throw new AppError("Bạn không có quyền chỉnh sửa bài giảng này.", 403, "FORBIDDEN");
  }
  return lesson;
}

/** Throws unless the lesson is shown in the class. */
async function requireLessonInClass(classId: string, lessonId: string) {
  const link = await prisma.classLesson.findUnique({
    where: { classId_lessonId: { classId, lessonId } },
    select: { id: true },
  });
  if (!link) throw NOT_FOUND();
}

const LIBRARY_INCLUDE = {
  items: { where: { deletedAt: null }, orderBy: { order: "asc" as const } },
  owner: { select: { id: true, name: true } },
  classLinks: {
    select: { class: { select: { id: true, name: true, archived: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

/** The actor's lesson library (admins see every teacher's lessons). */
export async function listLibraryLessons(actor: Actor) {
  return prisma.lesson.findMany({
    where: { deletedAt: null, ...(actor.role === "ADMIN" ? {} : { ownerId: actor.id }) },
    include: LIBRARY_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
}

/** Lessons shown in a class, in the class's order (same shape as before the library existed). */
export async function listClassLessons(classId: string) {
  const links = await prisma.classLesson.findMany({
    where: { classId, lesson: { deletedAt: null } },
    include: {
      lesson: {
        include: {
          items: { where: { deletedAt: null }, orderBy: { order: "asc" } },
          owner: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return links.map((l) => ({ ...l.lesson, order: l.order }));
}

async function nextClassOrder(classId: string) {
  const last = await prisma.classLesson.aggregate({ where: { classId }, _max: { order: true } });
  return (last._max.order ?? -1) + 1;
}

/** Creates a lesson in the owner's library; with `classId` it is also shown in that class. */
export async function createLesson(
  ownerId: string,
  input: { title: string; description?: string | null },
  opts: { classId?: string } = {}
) {
  const order = opts.classId ? await nextClassOrder(opts.classId) : 0;
  return prisma.lesson.create({
    data: {
      ownerId,
      classId: opts.classId ?? null,
      title: input.title,
      description: input.description ?? null,
      order,
      ...(opts.classId ? { classLinks: { create: { classId: opts.classId, order } } } : {}),
    },
    include: LIBRARY_INCLUDE,
  });
}

export async function updateLesson(
  actor: Actor,
  lessonId: string,
  input: { title?: string; description?: string | null }
) {
  await requireEditableLesson(actor, lessonId);
  return prisma.lesson.update({
    where: { id: lessonId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
    include: LIBRARY_INCLUDE,
  });
}

/** Deletes a lesson everywhere (all classes) together with its files. */
export async function deleteLessonEverywhere(actor: Actor, lessonId: string) {
  await requireEditableLesson(actor, lessonId);
  const lesson = await prisma.lesson.findUniqueOrThrow({
    where: { id: lessonId },
    include: { items: true },
  });
  const fileKeys = lesson.items.map((i) => i.fileKey).filter((k): k is string => Boolean(k));
  const queued = await enqueueDriveTrashForKeys(fileKeys, "LESSON_DELETED");
  await prisma.lesson.delete({ where: { id: lesson.id } });
  if (queued === 0) {
    const storage = getStorageProvider();
    for (const key of fileKeys) {
      await storage.delete(key).catch(() => undefined);
    }
  }
}

/**
 * Sets exactly which of the actor's classes show this lesson: adds the new ones (at the end of each
 * class) and removes unchecked ones. Classes the actor does not manage are never touched.
 */
export async function setLessonClasses(actor: Actor, lessonId: string, classIds: string[]) {
  await requireEditableLesson(actor, lessonId);
  const wanted = [...new Set(classIds)];

  const manageable = await prisma.class.findMany({
    where: {
      id: { in: wanted },
      ...(actor.role === "ADMIN" ? {} : { teacherId: actor.id }),
    },
    select: { id: true },
  });
  if (manageable.length !== wanted.length) {
    throw new AppError(
      "Một hoặc nhiều lớp học không hợp lệ hoặc không thuộc quyền quản lý của bạn.",
      400,
      "INVALID_CLASSES"
    );
  }

  const current = await prisma.classLesson.findMany({
    where: {
      lessonId,
      ...(actor.role === "ADMIN" ? {} : { class: { teacherId: actor.id } }),
    },
    select: { classId: true },
  });
  const currentIds = new Set(current.map((c) => c.classId));
  const toAdd = wanted.filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !wanted.includes(id));

  for (const classId of toAdd) {
    const order = await nextClassOrder(classId);
    await prisma.classLesson.upsert({
      where: { classId_lessonId: { classId, lessonId } },
      create: { classId, lessonId, order },
      update: {},
    });
  }
  if (toRemove.length > 0) {
    await prisma.classLesson.deleteMany({ where: { lessonId, classId: { in: toRemove } } });
  }
  return { added: toAdd.length, removed: toRemove.length };
}

/** Shows existing library lessons in a class (class teacher; own lessons only unless admin). */
export async function addLessonsToClass(actor: Actor, classId: string, lessonIds: string[]) {
  const ids = [...new Set(lessonIds)];
  const lessons = await prisma.lesson.findMany({
    where: { id: { in: ids }, deletedAt: null, ...(actor.role === "ADMIN" ? {} : { ownerId: actor.id }) },
    select: { id: true },
  });
  if (lessons.length !== ids.length) {
    throw new AppError("Một hoặc nhiều bài giảng không thuộc kho của bạn.", 400, "INVALID_LESSONS");
  }
  let order = await nextClassOrder(classId);
  let added = 0;
  for (const lessonId of ids) {
    const exists = await prisma.classLesson.findUnique({
      where: { classId_lessonId: { classId, lessonId } },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.classLesson.create({ data: { classId, lessonId, order: order++ } });
    added++;
  }
  return { added };
}

/** Removes a lesson from one class; the lesson stays in the library and in other classes. */
export async function removeLessonFromClass(classId: string, lessonId: string) {
  const res = await prisma.classLesson.deleteMany({ where: { classId, lessonId } });
  if (res.count === 0) throw NOT_FOUND();
}

export async function createLessonItem(
  actor: Actor,
  lessonId: string,
  input: {
    title: string;
    type: LessonItemType;
    url?: string | null;
    fileKey?: string | null;
    driveFileId?: string | null;
    order?: number;
  },
  opts: { classId?: string } = {}
) {
  await requireEditableLesson(actor, lessonId);
  if (opts.classId) await requireLessonInClass(opts.classId, lessonId);
  const count = await prisma.lessonItem.count({ where: { lessonId } });
  const item = await prisma.lessonItem.create({
    data: {
      lessonId,
      title: input.title,
      type: input.type,
      url: input.url?.trim() || null,
      fileKey: input.fileKey?.trim() || null,
      driveFileId: input.driveFileId?.trim() || null,
      order: input.order ?? count,
    },
  });
  await prisma.lesson.update({ where: { id: lessonId }, data: { updatedAt: new Date() } });
  return item;
}

export async function uploadLessonAttachment(
  actor: Actor,
  lessonId: string,
  buffer: Buffer,
  mimeType: string,
  opts: { classId?: string } = {}
) {
  const lesson = await requireEditableLesson(actor, lessonId);
  if (opts.classId) await requireLessonInClass(opts.classId, lessonId);

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

  // files of library lessons are not tied to one class any more
  const folderClassId = opts.classId ?? lesson.classId ?? undefined;
  const fileKey = `lessons/${folderClassId ?? `library-${lesson.ownerId ?? "admin"}`}/${lessonId}/${crypto.randomUUID()}${ext}`;
  await getStorageProvider().put(fileKey, buffer, mimeType, {
    classId: folderClassId,
    ownerId: lesson.ownerId ?? undefined,
    kind: "LESSON_FILE",
  });
  return { fileKey };
}

export async function deleteLessonItem(
  actor: Actor,
  lessonId: string,
  itemId: string,
  opts: { classId?: string } = {}
) {
  await requireEditableLesson(actor, lessonId);
  if (opts.classId) await requireLessonInClass(opts.classId, lessonId);
  const item = await prisma.lessonItem.findFirst({ where: { id: itemId, lessonId } });
  if (!item) {
    throw new AppError("Không tìm thấy tài liệu.", 404, "NOT_FOUND");
  }
  const queued = item.fileKey
    ? await enqueueDriveTrashForKeys([item.fileKey], "LESSON_ITEM_DELETED")
    : 0;
  await prisma.lessonItem.delete({ where: { id: item.id } });
  if (item.fileKey && queued === 0) {
    await getStorageProvider().delete(item.fileKey).catch(() => undefined);
  }
}

/** Shared by the library and class routes: parses a JSON or multipart "add material" request. */
export async function readLessonItemRequest(
  req: Request,
  actor: Actor,
  lessonId: string,
  opts: { classId?: string } = {}
): Promise<{ title: unknown; type: unknown; url: unknown; fileKey: unknown; driveFileId?: unknown }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return (await req.json()) as { title: unknown; type: unknown; url: unknown; fileKey: unknown };
  }
  const formData = await req.formData();
  const file = formData.get("file");
  let fileKey: string | null = null;
  if (file instanceof File && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());
    fileKey = (await uploadLessonAttachment(actor, lessonId, buffer, file.type, opts)).fileKey;
  }
  const url = String(formData.get("url") ?? "").trim();
  return {
    title: String(formData.get("title") ?? "").trim(),
    type: String(formData.get("type") ?? "PDF").trim(),
    url: url || null,
    fileKey,
  };
}
