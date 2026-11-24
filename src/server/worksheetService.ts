import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getStorageProvider } from "@/lib/storage";
import { parsePdfMetadata, validatePdfBuffer } from "@/lib/pdf/server-pdf";
import { regradeWorksheetSubmissions } from "./regradeService";
import { enqueueDriveTrashForKeys, getStorageLocationsForKeys } from "./driveService";

async function countWorksheetSubmissions(worksheetId: string): Promise<number> {
  return prisma.submission.count({ where: { assignment: { worksheetId } } });
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
  audioId: true,
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
    where: { ownerId },
    include: {
      _count: {
        select: { fields: true, assignments: true, audios: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function listSharedWorksheets(excludeOwnerId: string) {
  return prisma.worksheet.findMany({
    where: {
      isShared: true,
      ownerId: { not: excludeOwnerId },
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: {
        select: { fields: true, assignments: true, audios: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createWorksheet(
  ownerId: string,
  input: { title: string; instructions?: string | null }
) {
  return prisma.worksheet.create({
    data: {
      ownerId,
      title: input.title,
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
  input: { title?: string; instructions?: string | null; isShared?: boolean }
) {
  return prisma.worksheet.update({
    where: { id: worksheetId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      ...(input.isShared !== undefined ? { isShared: input.isShared } : {}),
    },
  });
}

export async function deleteWorksheet(worksheetId: string) {
  const ws = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    select: { pdfFileKey: true, audios: { select: { fileKey: true } } },
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

export interface SaveFieldPayload {
  id?: string;
  placement: "OVERLAY" | "ANSWER_SHEET";
  type:
    | "TEXT"
    | "NUMBER"
    | "MULTIPLE_CHOICE"
    | "MULTI_SELECT"
    | "TRUE_FALSE"
    | "DROPDOWN"
    | "CHECKBOX"
    | "ESSAY"
    | "DICTATION";
  label: string;
  prompt?: string | null;
  explanation?: string | null;
  skillTag?: "GRAMMAR" | "VOCABULARY" | "READING" | "LISTENING" | "WRITING" | "SPEAKING" | null;
  audioId?: string | null;
  order: number;
  points: number;
  pageIndex?: number | null;
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
  style?: Record<string, unknown> | null;
  options?: Array<{ id: string; text: string }> | null;
  answerKey: Record<string, unknown>;
  gradingOpts?: Record<string, unknown> | null;
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
      const data = {
        placement: f.placement,
        type: f.type,
        label: f.label,
        prompt: f.prompt ?? null,
        explanation: f.explanation ?? null,
        skillTag: f.skillTag ?? null,
        audioId: safeAudioId,
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

  // Check if worksheet PDF
  const worksheet = await prisma.worksheet.findFirst({
    where: { pdfFileKey: fileKey },
    select: { id: true, ownerId: true },
  });
  if (worksheet) {
    if (role === "TEACHER" && worksheet.ownerId === userId) return true;
    if (role === "STUDENT") {
      // Only after the student has started an attempt (prevents reading the exam PDF
      // before openAt / before the timer starts).
      const assigned = await prisma.assignment.findFirst({
        where: {
          worksheetId: worksheet.id,
          class: {
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
            class: { select: { teacherId: true } },
          },
        },
      },
    });
    if (!sub) return false;
    if (role === "TEACHER" && sub.assignment.class.teacherId === userId) return true;
    if (role === "PARENT" && sub.assignment.shareProctorWithParent) {
      const linked = await prisma.parentLink.findFirst({
        where: { parentId: userId, studentId: sub.studentId, verifiedAt: { not: null } },
        select: { id: true },
      });
      return Boolean(linked);
    }
    return false;
  }

  // Check if lesson item attachment
  const lessonItem = await prisma.lessonItem.findFirst({
    where: { fileKey },
    include: { lesson: { include: { class: true } } },
  });
  if (lessonItem) {
    const cls = lessonItem.lesson.class;
    if (role === "TEACHER" && cls.teacherId === userId) return true;
    if (role === "STUDENT") {
      const enrolled = await prisma.enrollment.findUnique({
        where: { classId_studentId: { classId: cls.id, studentId: userId } },
      });
      return enrolled?.status === "ACTIVE";
    }
    return false;
  }

  return false;
}
