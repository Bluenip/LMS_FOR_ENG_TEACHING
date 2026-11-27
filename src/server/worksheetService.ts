import crypto from "node:crypto";
import { Prisma, type FieldType, type WorksheetSubject } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getStorageProvider } from "@/lib/storage";
import { parsePdfMetadata, validatePdfBuffer } from "@/lib/pdf/server-pdf";
import { detectImageMeta, normalizeImagePagePt } from "@/lib/image-meta";
import { regradeWorksheetSubmissions } from "./regradeService";
import { enqueueDriveTrashForKeys, getStorageLocationsForKeys } from "./driveService";
import { logAudit } from "@/server/auditService";

async function countWorksheetSubmissions(worksheetId: string): Promise<number> {
  return prisma.submission.count({
    where: { assignment: { worksheetId, class: { deletedAt: null } } },
  });
}

/**
 * Explicit Prisma select for student-facing fields.
 * SECURITY REQUIREMENT: NEVER include `answerKey` or `gradingOpts` or `explanation` (until revealed)!
 */
export const STUDENT_FIELD_SELECT = {
  id: true,
  worksheetId: true,
  placement: true,
  type: true,
  label: true,
  prompt: true,
  skillTag: true,
  topicTag: true,
  passageId: true,
  audioId: true,
  imageKey: true,
  order: true,
  points: true,
  pageIndex: true,
  x: true,
  y: true,
  w: true,
  h: true,
  style: true,
  options: true,
} satisfies Prisma.FieldSelect;

export async function listTeacherWorksheets(ownerId: string) {
  return prisma.worksheet.findMany({
    where: { ownerId, deletedAt: null },
    include: {
      _count: {
        select: {
          fields: true,
          assignments: { where: { class: { deletedAt: null } } },
          audios: true,
          driveFiles: { where: { trashedAt: null, kind: { in: ["WORKSHEET_PDF", "WORKSHEET_AUDIO"] } } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

/** Other teachers' worksheets: only the shared ones, or all of them for an admin (`all`). */
export async function listSharedWorksheets(excludeOwnerId: string, opts?: { all?: boolean }) {
  return prisma.worksheet.findMany({
    where: {
      deletedAt: null,
      ...(opts?.all ? {} : { isShared: true }),
      ownerId: { not: excludeOwnerId },
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: {
        select: {
          fields: true,
          assignments: { where: { class: { deletedAt: null } } },
          audios: true,
          driveFiles: { where: { trashedAt: null, kind: { in: ["WORKSHEET_PDF", "WORKSHEET_AUDIO"] } } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createWorksheet(
  ownerId: string,
  input: { title: string; subject?: WorksheetSubject; instructions?: string | null }
) {
  return prisma.worksheet.create({
    data: {
      ownerId,
      title: input.title,
      subject: input.subject ?? "GENERAL",
      instructions: input.instructions ?? null,
    },
    include: {
      pages: { orderBy: { pageIndex: "asc" } },
      fields: { orderBy: { order: "asc" } },
      audios: { orderBy: { order: "asc" } },
    },
  });
}

export async function updateWorksheet(
  worksheetId: string,
  input: {
    title?: string;
    subject?: WorksheetSubject;
    instructions?: string | null;
    passages?: Array<{ id: string; title: string; content: string; order: number }> | null;
    isShared?: boolean;
    folderId?: string | null;
    tags?: string[];
    isPublic?: boolean;
    publicLevel?: string | null;
  }
) {
  if (input.folderId) {
    const existingWs = await prisma.worksheet.findUnique({
      where: { id: worksheetId },
      select: { ownerId: true },
    });
    const folder = await prisma.libraryFolder.findUnique({
      where: { id: input.folderId },
      select: { ownerId: true, kind: true },
    });
    if (!existingWs || !folder || folder.ownerId !== existingWs.ownerId || folder.kind !== "WORKSHEET") {
      throw new AppError("Không tìm thấy thư mục.", 404, "NOT_FOUND");
    }
  }

  return prisma.worksheet.update({
    where: { id: worksheetId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      ...(input.passages !== undefined
        ? {
            passages:
              input.passages === null
                ? Prisma.JsonNull
                : (input.passages as unknown as Prisma.InputJsonValue),
          }
        : {}),
      ...(input.isShared !== undefined ? { isShared: input.isShared } : {}),
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      ...(input.publicLevel !== undefined ? { publicLevel: input.publicLevel } : {}),
    },
  });
}

export async function deleteWorksheet(worksheetId: string, actorId?: string) {
  const ws = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    select: { title: true, ownerId: true, pdfFileKey: true, audios: { select: { fileKey: true } } },
  });
  if (!ws) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }
  const submissionCount = await countWorksheetSubmissions(worksheetId);
  if (submissionCount > 0) {
    throw new AppError(
      `Worksheet đã có ${submissionCount} bài làm của học sinh. Hãy xoá các bài tập đã giao trước nếu thật sự muốn xoá worksheet.`,
      409,
      "WORKSHEET_HAS_SUBMISSIONS"
    );
  }
  const keysToClean: string[] = [];
  if (ws.pdfFileKey) keysToClean.push(ws.pdfFileKey);
  for (const a of ws.audios) keysToClean.push(a.fileKey);

  // Queue Drive files for asynchronous trash BEFORE deleting DB record (no Google call in DB tx)
  const queuedCount = await enqueueDriveTrashForKeys(keysToClean, "WORKSHEET_DELETED");
  await prisma.worksheet.delete({ where: { id: worksheetId } });

  await logAudit({
    actorId: actorId ?? null,
    action: "WORKSHEET_DELETED",
    targetType: "WORKSHEET",
    targetId: worksheetId,
    summary: `Xoá worksheet: ${ws.title}`,
    summaryEn: `Deleted worksheet: ${ws.title}`,
    meta: { title: ws.title, ownerId: ws.ownerId },
  });

  if (queuedCount === 0) {
    const storage = getStorageProvider();
    for (const key of keysToClean) {
      await storage.delete(key).catch(() => undefined);
    }
  }
}

export async function getWorksheetForTeacher(worksheetId: string) {
  const worksheet = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    include: {
      pages: { orderBy: { pageIndex: "asc" } },
      fields: { orderBy: { order: "asc" } },
      audios: { orderBy: { order: "asc" } },
    },
  });
  if (!worksheet) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }
  const keys = [
    ...(worksheet.pdfFileKey ? [worksheet.pdfFileKey] : []),
    ...worksheet.pages.flatMap((p) => (p.imageKey ? [p.imageKey] : [])),
    ...worksheet.fields.flatMap((f) => (f.imageKey ? [f.imageKey] : [])),
    ...worksheet.audios.map((a) => a.fileKey),
  ];
  const storageLocations = await getStorageLocationsForKeys(keys);
  return { ...worksheet, storageLocations };
}

export async function uploadWorksheetPdf(
  worksheetId: string,
  buffer: Buffer,
  mimeType?: string
) {
  validatePdfBuffer(buffer, mimeType);
  const metadata = await parsePdfMetadata(buffer);
  if (metadata.pageCount <= 0) {
    throw new AppError("File PDF không có trang nào.", 400, "EMPTY_PDF");
  }

  const existing = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    select: { pdfFileKey: true, ownerId: true, title: true },
  });
  if (!existing) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }

  if ((await countWorksheetSubmissions(worksheetId)) > 0) {
    throw new AppError(
      "Không thể thay file PDF vì đã có học sinh làm bài trên worksheet này (vị trí các ô sẽ bị lệch).",
      409,
      "WORKSHEET_HAS_SUBMISSIONS"
    );
  }

  const fileKey = `worksheets/${worksheetId}/${crypto.randomUUID()}.pdf`;
  const storage = getStorageProvider();
  await storage.put(fileKey, buffer, "application/pdf", {
    ownerId: existing.ownerId,
    kind: "WORKSHEET_PDF",
    worksheetId,
    worksheetTitle: existing.title,
    fileName: "de.pdf",
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.worksheetPage.deleteMany({ where: { worksheetId } });
    return tx.worksheet.update({
      where: { id: worksheetId },
      data: {
        pdfFileKey: fileKey,
        pageCount: metadata.pageCount,
        pages: {
          create: metadata.pages.map((p) => ({
            pageIndex: p.pageIndex,
            widthPt: p.widthPt,
            heightPt: p.heightPt,
          })),
        },
      },
      include: {
        pages: { orderBy: { pageIndex: "asc" } },
        fields: { orderBy: { order: "asc" } },
      },
    });
  });

  if (existing.pdfFileKey && existing.pdfFileKey !== fileKey) {
    await storage.delete(existing.pdfFileKey).catch(() => undefined);
  }

  return updated;
}

const MAX_FIELD_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PAGE_IMAGE_BYTES = 10 * 1024 * 1024;

export async function uploadFieldIllustrationImage(
  worksheetId: string,
  fieldId: string | null | undefined,
  buffer: Buffer,
  mimeType?: string
) {
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_FIELD_IMAGE_BYTES) {
    throw new AppError("Ảnh vượt quá dung lượng tối đa cho phép.", 400, "FILE_TOO_LARGE");
  }
  if (mimeType && !mimeType.startsWith("image/") && mimeType !== "application/octet-stream") {
    throw new AppError("Vui lòng chọn file ảnh hợp lệ (PNG, JPG hoặc WebP).", 400, "INVALID_IMAGE");
  }
  const meta = detectImageMeta(buffer);
  if (!meta) {
    throw new AppError("Vui lòng chọn file ảnh hợp lệ (PNG, JPG hoặc WebP).", 400, "INVALID_IMAGE");
  }

  const ws = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    select: { id: true, ownerId: true, title: true },
  });
  if (!ws) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }

  const existingField = fieldId
    ? await prisma.field.findFirst({
        where: { id: fieldId, worksheetId },
        select: { id: true, imageKey: true },
      })
    : null;

  const imageKey = `worksheets/${worksheetId}/images/${crypto.randomUUID()}${meta.ext}`;
  const storage = getStorageProvider();
  await storage.put(imageKey, buffer, meta.mime, {
    ownerId: ws.ownerId,
    kind: "WORKSHEET_PDF",
    worksheetId,
    worksheetTitle: ws.title,
    fileName: `cau-hoi${meta.ext}`,
  });

  if (existingField) {
    await prisma.field.update({
      where: { id: existingField.id },
      data: { imageKey },
    });
    if (existingField.imageKey && existingField.imageKey !== imageKey) {
      await storage.delete(existingField.imageKey).catch(() => undefined);
    }
  }

  return { imageKey };
}

export async function deleteFieldIllustrationImage(
  worksheetId: string,
  fieldId?: string | null,
  imageKeyParam?: string | null
) {
  let targetKey =
    imageKeyParam &&
    !imageKeyParam.includes("..") &&
    imageKeyParam.startsWith(`worksheets/${worksheetId}/images/`)
      ? imageKeyParam
      : null;

  if (fieldId) {
    const existingField = await prisma.field.findFirst({
      where: { id: fieldId, worksheetId },
      select: { id: true, imageKey: true },
    });
    if (existingField) {
      targetKey = targetKey ?? existingField.imageKey;
      if (existingField.imageKey) {
        await prisma.field.update({
          where: { id: existingField.id },
          data: { imageKey: null },
        });
      }
    }
  }

  if (targetKey) {
    await getStorageProvider().delete(targetKey).catch(() => undefined);
  }
  return { ok: true };
}

export async function uploadWorksheetBackgroundImages(
  worksheetId: string,
  files: Array<{ buffer: Buffer; mimeType?: string }>
) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 30) {
    throw new AppError("Vui lòng chọn từ 1 đến 30 ảnh trang đề.", 400, "VALIDATION_ERROR");
  }

  const existing = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    select: {
      id: true,
      ownerId: true,
      title: true,
      pdfFileKey: true,
      pages: { select: { imageKey: true } },
    },
  });
  if (!existing) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }

  if ((await countWorksheetSubmissions(worksheetId)) > 0) {
    throw new AppError(
      "Không thể thay ảnh nền vì đã có học sinh làm bài trên worksheet này.",
      409,
      "WORKSHEET_HAS_SUBMISSIONS"
    );
  }

  const parsedFiles: Array<{
    buffer: Buffer;
    ext: ".jpg" | ".png" | ".webp";
    mime: string;
    widthPt: number;
    heightPt: number;
  }> = [];

  for (const f of files) {
    if (f.buffer.byteLength === 0 || f.buffer.byteLength > MAX_PAGE_IMAGE_BYTES) {
      throw new AppError("Ảnh vượt quá dung lượng tối đa cho phép.", 400, "FILE_TOO_LARGE");
    }
    if (f.mimeType && !f.mimeType.startsWith("image/") && f.mimeType !== "application/octet-stream") {
      throw new AppError("Vui lòng chọn file ảnh hợp lệ (PNG, JPG hoặc WebP).", 400, "INVALID_IMAGE");
    }
    const meta = detectImageMeta(f.buffer);
    if (!meta) {
      throw new AppError("Vui lòng chọn file ảnh hợp lệ (PNG, JPG hoặc WebP).", 400, "INVALID_IMAGE");
    }
    const dims = normalizeImagePagePt(meta.width, meta.height);
    parsedFiles.push({
      buffer: f.buffer,
      ext: meta.ext,
      mime: meta.mime,
      widthPt: dims.widthPt,
      heightPt: dims.heightPt,
    });
  }

  const storage = getStorageProvider();
  const uploadedPages: Array<{
    pageIndex: number;
    widthPt: number;
    heightPt: number;
    imageKey: string;
  }> = [];

  for (let i = 0; i < parsedFiles.length; i++) {
    const pf = parsedFiles[i]!;
    const imageKey = `worksheets/${worksheetId}/images/${crypto.randomUUID()}${pf.ext}`;
    await storage.put(imageKey, pf.buffer, pf.mime, {
      ownerId: existing.ownerId,
      kind: "WORKSHEET_PDF",
      worksheetId,
      worksheetTitle: existing.title,
      fileName: `trang-${i + 1}${pf.ext}`,
    });
    uploadedPages.push({
      pageIndex: i,
      widthPt: pf.widthPt,
      heightPt: pf.heightPt,
      imageKey,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.worksheetPage.deleteMany({ where: { worksheetId } });
    return tx.worksheet.update({
      where: { id: worksheetId },
      data: {
        pdfFileKey: null,
        pageCount: uploadedPages.length,
        pages: {
          create: uploadedPages,
        },
      },
      include: {
        pages: { orderBy: { pageIndex: "asc" } },
        fields: { orderBy: { order: "asc" } },
      },
    });
  });

  if (existing.pdfFileKey) {
    await storage.delete(existing.pdfFileKey).catch(() => undefined);
  }
  for (const oldPg of existing.pages) {
    if (oldPg.imageKey) {
      await storage.delete(oldPg.imageKey).catch(() => undefined);
    }
  }

  return updated;
}

export interface SaveFieldPayload {
  id?: string;
  placement: "OVERLAY" | "ANSWER_SHEET";
  type: FieldType;
  label: string;
  prompt?: string | null;
  explanation?: string | null;
  skillTag?: "GRAMMAR" | "VOCABULARY" | "READING" | "LISTENING" | "WRITING" | "SPEAKING" | null;
  topicTag?: string | null;
  passageId?: string | null;
  audioId?: string | null;
  imageKey?: string | null;
  order: number;
  points: number;
  pageIndex?: number | null;
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
  style?: Record<string, unknown> | null;
  options?: unknown;
  answerKey: Record<string, unknown>;
  gradingOpts?: Record<string, unknown> | null;
  rubric?: Array<{ id: string; title: string; description?: string; maxPoints: number }> | null;
}

/**
 * Replaces/upserts the full field list of a worksheet inside a transaction.
 * Preserves existing field IDs where possible so historical answers stay linked!
 */
export async function saveWorksheetFields(worksheetId: string, fields: SaveFieldPayload[]) {
  const saved = await prisma.$transaction(async (tx) => {
    const existing = await tx.field.findMany({
      where: { worksheetId },
      select: { id: true, type: true, label: true, _count: { select: { answers: true } } },
    });
    const existingIds = new Set(existing.map((f) => f.id));
    const incomingExistingIds = new Set(
      fields.map((f) => f.id).filter((id): id is string => Boolean(id && existingIds.has(id)))
    );

    const toDelete = existing.map((f) => f.id).filter((id) => !incomingExistingIds.has(id));

    // Protect student work: a field that already has answers can neither be deleted
    // nor change its type (that would silently wipe / corrupt submitted answers).
    const answered = existing.filter((f) => f._count.answers > 0);
    const deletedAnswered = answered.filter((f) => toDelete.includes(f.id));
    if (deletedAnswered.length > 0) {
      throw new AppError(
        `Không thể xoá câu ${deletedAnswered.map((f) => f.label).join(", ")} vì đã có học sinh trả lời.`,
        409,
        "FIELD_HAS_ANSWERS"
      );
    }
    const incomingById = new Map(fields.filter((f) => f.id).map((f) => [f.id!, f]));
    const retyped = answered.filter((f) => {
      const inc = incomingById.get(f.id);
      return inc && inc.type !== f.type;
    });
    if (retyped.length > 0) {
      throw new AppError(
        `Không thể đổi loại câu ${retyped.map((f) => f.label).join(", ")} vì đã có học sinh trả lời.`,
        409,
        "FIELD_HAS_ANSWERS"
      );
    }
    if (toDelete.length > 0) {
      await tx.field.deleteMany({
        where: { worksheetId, id: { in: toDelete } },
      });
    }

    const existingAudios = await tx.worksheetAudio.findMany({
      where: { worksheetId },
      select: { id: true },
    });
    const validAudioIds = new Set(existingAudios.map((a) => a.id));

    const saved = [];
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i]!;
      const safeAudioId = f.audioId && validAudioIds.has(f.audioId) ? f.audioId : null;
      const safeImageKey =
        typeof f.imageKey === "string" &&
        !f.imageKey.includes("..") &&
        f.imageKey.startsWith(`worksheets/${worksheetId}/images/`)
          ? f.imageKey
          : null;
      const data = {
        placement: f.placement,
        type: f.type,
        label: f.label,
        prompt: f.prompt ?? null,
        explanation: f.explanation ?? null,
        skillTag: f.skillTag ?? null,
        topicTag: f.topicTag?.trim() ? f.topicTag.trim() : null,
        passageId: f.passageId ?? null,
        audioId: safeAudioId,
        imageKey: safeImageKey,
        order: i,
        points: f.points,
        pageIndex: f.placement === "OVERLAY" ? (f.pageIndex ?? 0) : null,
        x: f.placement === "OVERLAY" ? (f.x ?? 0) : null,
        y: f.placement === "OVERLAY" ? (f.y ?? 0) : null,
        w: f.placement === "OVERLAY" ? (f.w ?? 0.15) : null,
        h: f.placement === "OVERLAY" ? (f.h ?? 0.04) : null,
        style: (f.style ?? undefined) as Prisma.InputJsonValue | undefined,
        options: (f.options ?? undefined) as Prisma.InputJsonValue | undefined,
        answerKey: f.answerKey as Prisma.InputJsonValue,
        gradingOpts: (f.gradingOpts ?? undefined) as Prisma.InputJsonValue | undefined,
        rubric: f.rubric ? (f.rubric as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      };

      if (f.id && existingIds.has(f.id)) {
        const updated = await tx.field.update({
          where: { id: f.id },
          data,
        });
        saved.push(updated);
      } else {
        const created = await tx.field.create({
          data: {
            ...data,
            worksheetId,
          },
        });
        saved.push(created);
      }
    }

    await tx.worksheet.update({
      where: { id: worksheetId },
      data: { updatedAt: new Date() },
    });

    return saved;
  });

  // Answer keys / points may have changed: re-grade already finalized submissions
  await regradeWorksheetSubmissions(worksheetId);
  return saved;
}

/**
 * Checks whether a user has permission to download a stored file (PDF / lesson attachment).
 */
export async function authorizeFileDownload(
  userId: string,
  role: "ADMIN" | "TEACHER" | "STUDENT" | "PARENT",
  fileKey: string
): Promise<boolean> {
  if (role === "ADMIN") return true;
  // profile pictures are visible to every signed-in user (class rosters, navbar, comments)
  if (/^avatars\/[A-Za-z0-9_-]+\/[0-9a-f-]+\.(jpg|png|webp)$/.test(fileKey)) return true;

  // Check if worksheet PDF
  const worksheet = await prisma.worksheet.findFirst({
    where: { pdfFileKey: fileKey },
    select: { id: true, ownerId: true, isPublic: true, publicHiddenByAdmin: true },
  });
  if (worksheet) {
    if (role === "TEACHER") {
      if (worksheet.ownerId === userId) return true;
      if (worksheet.isPublic && !worksheet.publicHiddenByAdmin) return true;
      const taught = await prisma.assignment.findFirst({
        where: {
          worksheetId: worksheet.id,
          class: {
            deletedAt: null,
            OR: [{ teacherId: userId }, { classTeachers: { some: { userId } } }],
          },
        },
        select: { id: true },
      });
      if (taught) return true;
    }
    if (role === "STUDENT") {
      // Only after the student has started an attempt (prevents reading the exam PDF
      // before openAt / before the timer starts).
      const assigned = await prisma.assignment.findFirst({
        where: {
          worksheetId: worksheet.id,
          class: {
            deletedAt: null,
            enrollments: {
              some: { studentId: userId, status: "ACTIVE" },
            },
          },
          submissions: { some: { studentId: userId } },
        },
        select: { id: true },
      });
      return Boolean(assigned);
    }
    if (role === "PARENT") {
      const assignedToChild = await prisma.assignment.findFirst({
        where: {
          worksheetId: worksheet.id,
          class: {
            deletedAt: null,
            enrollments: {
              some: {
                status: "ACTIVE",
                student: {
                  parentLinksAsChild: {
                    some: { parentId: userId, verifiedAt: { not: null } },
                  },
                },
              },
            },
          },
        },
        select: { id: true },
      });
      return Boolean(assignedToChild);
    }
    return false;
  }

  // Check if worksheet background/illustration image (worksheets/{id}/images/{file})
  const imgMatch = /^worksheets\/([A-Za-z0-9_-]+)\/images\/[A-Za-z0-9_.-]+$/.exec(fileKey);
  if (imgMatch) {
    const wsId = imgMatch[1]!;
    const ws = await prisma.worksheet.findFirst({
      where: { id: wsId, deletedAt: null },
      select: { id: true, ownerId: true, isShared: true, isPublic: true, publicHiddenByAdmin: true },
    });
    if (!ws) return false;
    if (role === "TEACHER" && ws.ownerId === userId) return true;

    // For non-owner teachers (shared/public), students, and parents, confirm the key actually belongs to this worksheet
    const isReferenced = await prisma.worksheet.findFirst({
      where: {
        id: wsId,
        OR: [
          { pages: { some: { imageKey: fileKey } } },
          { fields: { some: { imageKey: fileKey } } },
        ],
      },
      select: { id: true },
    });
    if (!isReferenced) return false;

    if (role === "TEACHER") {
      if (ws.isShared || (ws.isPublic && !ws.publicHiddenByAdmin)) return true;
      const taught = await prisma.assignment.findFirst({
        where: {
          worksheetId: wsId,
          class: {
            deletedAt: null,
            OR: [{ teacherId: userId }, { classTeachers: { some: { userId } } }],
          },
        },
        select: { id: true },
      });
      return Boolean(taught);
    }
    if (role === "STUDENT") {
      const assigned = await prisma.assignment.findFirst({
        where: {
          worksheetId: wsId,
          class: {
            deletedAt: null,
            enrollments: { some: { studentId: userId, status: "ACTIVE" } },
          },
          submissions: { some: { studentId: userId } },
        },
        select: { id: true },
      });
      return Boolean(assigned);
    }
    if (role === "PARENT") {
      const assignedToChild = await prisma.assignment.findFirst({
        where: {
          worksheetId: wsId,
          class: {
            deletedAt: null,
            enrollments: {
              some: {
                status: "ACTIVE",
                student: {
                  parentLinksAsChild: {
                    some: { parentId: userId, verifiedAt: { not: null } },
                  },
                },
              },
            },
          },
        },
        select: { id: true },
      });
      return Boolean(assignedToChild);
    }
    return false;
  }

  // Check if worksheet audio (ONLY teacher owner or admin may access directly; students MUST use play-limited stream route)
  const worksheetAudio = await prisma.worksheetAudio.findFirst({
    where: { fileKey },
    include: { worksheet: { select: { ownerId: true } } },
  });
  if (worksheetAudio) {
    if (role === "TEACHER" && worksheetAudio.worksheet.ownerId === userId) return true;
    return false;
  }

  // Quick textbook assignment attachments (assignments/quick/{classId}/{file})
  const quickMatch = /^assignments\/quick\/([A-Za-z0-9_-]+)\/[A-Za-z0-9_.-]+$/.exec(fileKey);
  if (quickMatch) {
    const classId = quickMatch[1]!;
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: {
        deletedAt: true,
        teacherId: true,
        classTeachers: { where: { userId }, select: { id: true } },
      },
    });
    if (!cls || cls.deletedAt) return false;
    if (role === "TEACHER") {
      if (cls.teacherId === userId || cls.classTeachers.length > 0) return true;
      // Also allow teachers/co-teachers of any class sharing an assignment with this attachmentKey
      const otherTaught = await prisma.assignment.findFirst({
        where: {
          isQuickTextbook: true,
          class: {
            deletedAt: null,
            OR: [{ teacherId: userId }, { classTeachers: { some: { userId } } }],
          },
          attachmentKeys: { array_contains: [{ key: fileKey }] },
        },
        select: { id: true },
      });
      return Boolean(otherTaught);
    }

    const candidates = await prisma.assignment.findMany({
      where: {
        isQuickTextbook: true,
        class: {
          deletedAt: null,
          ...(role === "STUDENT"
            ? {
                enrollments: { some: { studentId: userId, status: "ACTIVE" } },
              }
            : {
                enrollments: {
                  some: {
                    status: "ACTIVE",
                    student: {
                      parentLinksAsChild: {
                        some: { parentId: userId, verifiedAt: { not: null } },
                      },
                    },
                  },
                },
              }),
        },
        ...(role === "STUDENT"
          ? { OR: [{ targets: { none: {} } }, { targets: { some: { studentId: userId } } }] }
          : {}),
      },
      select: { attachmentKeys: true },
    });

    return candidates.some(
      (a) =>
        Array.isArray(a.attachmentKeys) &&
        a.attachmentKeys.some(
          (item) =>
            item !== null &&
            typeof item === "object" &&
            "key" in item &&
            (item as { key?: unknown }).key === fileKey
        )
    );
  }

  // Class feed post attachments (classes/{classId}/posts/{file})
  const postMatch = /^classes\/([A-Za-z0-9_-]+)\/posts\/[A-Za-z0-9_.-]+$/.exec(fileKey);
  if (postMatch) {
    const classId = postMatch[1]!;
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: {
        deletedAt: true,
        teacherId: true,
        classTeachers: { where: { userId }, select: { id: true } },
      },
    });
    if (!cls || cls.deletedAt) return false;
    if (role === "TEACHER") {
      return cls.teacherId === userId || cls.classTeachers.length > 0;
    }
    if (role === "STUDENT") {
      const enrolled = await prisma.enrollment.findUnique({
        where: { classId_studentId: { classId, studentId: userId } },
        select: { status: true },
      });
      return enrolled?.status === "ACTIVE";
    }
    return false;
  }

  // Check if camera proctor snapshot (proctor/{submissionId}/{filename}.jpg)
  if (fileKey.startsWith("proctor/")) {
    const parts = fileKey.split("/");
    const submissionId = parts[1];
    if (!submissionId) return false;
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        studentId: true,
        assignment: {
          select: {
            shareProctorWithParent: true,
            class: {
              select: {
                teacherId: true,
                classTeachers: { where: { userId }, select: { id: true } },
              },
            },
          },
        },
      },
    });
    if (!sub) return false;
    if (
      role === "TEACHER" &&
      (sub.assignment.class.teacherId === userId ||
        sub.assignment.class.classTeachers.length > 0)
    ) {
      return true;
    }
    if (role === "PARENT" && sub.assignment.shareProctorWithParent) {
      const linked = await prisma.parentLink.findFirst({
        where: { parentId: userId, studentId: sub.studentId, verifiedAt: { not: null } },
        select: { id: true },
      });
      return Boolean(linked);
    }
    return false;
  }

  // Student submitted handwritten photo / PDF (submissions/{submissionId}/{fieldId}/{file})
  if (fileKey.startsWith("submissions/")) {
    const parts = fileKey.split("/");
    const submissionId = parts[1];
    if (!submissionId) return false;
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        studentId: true,
        assignment: {
          select: {
            class: {
              select: {
                teacherId: true,
                deletedAt: true,
                classTeachers: { where: { userId }, select: { id: true } },
              },
            },
          },
        },
      },
    });
    if (!sub) return false;
    if (role === "STUDENT") return sub.studentId === userId;
    if (role === "TEACHER") {
      return (
        sub.assignment.class.teacherId === userId ||
        sub.assignment.class.classTeachers.length > 0
      );
    }
    if (role === "PARENT") {
      const linked = await prisma.parentLink.findFirst({
        where: { parentId: userId, studentId: sub.studentId, verifiedAt: { not: null } },
        select: { id: true },
      });
      return Boolean(linked);
    }
    return false;
  }

  // Lesson material: owner, teachers/co-teachers of any class showing the lesson, and students enrolled there
  const lessonItem = await prisma.lessonItem.findFirst({
    where: { fileKey, deletedAt: null, lesson: { deletedAt: null } },
    select: {
      lesson: {
        select: {
          ownerId: true,
          classLinks: {
            where: { class: { deletedAt: null } },
            select: {
              classId: true,
              class: {
                select: {
                  teacherId: true,
                  classTeachers: { where: { userId }, select: { id: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (lessonItem) {
    const { ownerId, classLinks } = lessonItem.lesson;
    if (role === "TEACHER") {
      return (
        ownerId === userId ||
        classLinks.some(
          (l) => l.class.teacherId === userId || l.class.classTeachers.length > 0
        )
      );
    }
    if (role === "STUDENT" && classLinks.length > 0) {
      const enrolled = await prisma.enrollment.findFirst({
        where: {
          studentId: userId,
          status: "ACTIVE",
          classId: { in: classLinks.map((l) => l.classId) },
        },
        select: { id: true },
      });
      return Boolean(enrolled);
    }
    return false;
  }

  return false;
}
