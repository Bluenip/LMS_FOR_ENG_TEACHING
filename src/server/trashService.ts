import type { DriveFileKind, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { TRASH_DAYS } from "@/lib/trash";
import { AppError } from "@/lib/errors";
import { getStorageProvider } from "@/lib/storage";
import { listTrashedDriveFileIds, trashDriveFile, untrashDriveFile } from "@/lib/drive/google-drive";
import { logAudit } from "@/server/auditService";
import { deleteWorksheet } from "@/server/worksheetService";
import { deleteClass } from "@/server/classService";

/**
 * Library trash (Phase 14).
 *
 * Deleting a worksheet, a lesson or a lesson material moves it to Pivora's trash and moves its files
 * to Google Drive's trash at the same time. Restoring brings both back. After CONTENT_TRASH_DAYS the
 * item is deleted for good (Google Drive empties its own trash after 30 days as well).
 *
 * Two-way sync with Drive (`syncTrashWithDrive`, hourly): if someone trashes a file directly in Google
 * Drive, its worksheet / material shows up in Pivora's trash (source "DRIVE") so the teacher can
 * restore it; if a file is restored in Drive, the item is restored in Pivora too.
 */

export const CONTENT_TRASH_DAYS = TRASH_DAYS;
const DAY_MS = 24 * 60 * 60 * 1000;

type Actor = { id: string; role: Role };
export type TrashKind = "CLASS" | "WORKSHEET" | "LESSON" | "LESSON_ITEM";
type TrashSource = "USER" | "DRIVE";

const SYSTEM: Actor = { id: "system", role: "ADMIN" };

// ---------------------------------------------------------------------------
// Files of an item
// ---------------------------------------------------------------------------

async function worksheetFileKeys(worksheetId: string) {
  const ws = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    select: { pdfFileKey: true, audios: { select: { fileKey: true } } },
  });
  if (!ws) return [];
  return [ws.pdfFileKey, ...ws.audios.map((a) => a.fileKey)].filter((k): k is string => Boolean(k));
}

async function lessonItemFileKeys(where: { lessonId?: string; id?: string }) {
  const items = await prisma.lessonItem.findMany({ where, select: { fileKey: true } });
  return items.map((i) => i.fileKey).filter((k): k is string => Boolean(k));
}

async function driveFilesFor(worksheetId: string | null, storageKeys: string[]) {
  if (!worksheetId && storageKeys.length === 0) return [];
  return prisma.driveFile.findMany({
    where: {
      trashedAt: null,
      OR: [
        ...(worksheetId
          ? [{ worksheetId, kind: { in: ["WORKSHEET_PDF", "WORKSHEET_AUDIO"] as DriveFileKind[] } }]
          : []),
        ...(storageKeys.length > 0 ? [{ storageKey: { in: storageKeys } }] : []),
      ],
    },
    select: { id: true, driveFileId: true, connectionId: true, softTrashedAt: true },
  });
}

/** Moves files to Drive's trash (best effort: a Drive outage never blocks deleting in Pivora). */
async function moveFilesToDriveTrash(files: Array<{ id: string; driveFileId: string; connectionId: string }>) {
  let failed = 0;
  for (const f of files) {
    try {
      await trashDriveFile(f.connectionId, f.driveFileId);
      await prisma.driveFile.update({ where: { id: f.id }, data: { softTrashedAt: new Date() } });
    } catch (err) {
      failed++;
      console.error("[Trash] Drive trash failed:", err instanceof Error ? err.message : "unknown");
    }
  }
  return failed;
}

/** Restores files from Drive's trash; returns how many no longer exist on Drive. */
async function restoreFilesFromDriveTrash(
  files: Array<{ id: string; driveFileId: string; connectionId: string; softTrashedAt: Date | null }>
) {
  let missing = 0;
  for (const f of files.filter((x) => x.softTrashedAt)) {
    try {
      const exists = await untrashDriveFile(f.connectionId, f.driveFileId);
      if (!exists) missing++;
      await prisma.driveFile.update({ where: { id: f.id }, data: { softTrashedAt: null } });
    } catch (err) {
      console.error("[Trash] Drive restore failed:", err instanceof Error ? err.message : "unknown");
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

function assertOwner(actor: Actor, ownerId: string | null, message: string) {
  if (actor.role !== "ADMIN" && ownerId !== actor.id) {
    throw new AppError(message, 403, "FORBIDDEN");
  }
}

async function loadItem(kind: TrashKind, id: string) {
  if (kind === "CLASS") {
    const c = await prisma.class.findUnique({
      where: { id },
      select: { id: true, name: true, teacherId: true, deletedAt: true },
    });
    return c ? { id: c.id, title: c.name, ownerId: c.teacherId, deletedAt: c.deletedAt } : null;
  }
  if (kind === "WORKSHEET") {
    const ws = await prisma.worksheet.findUnique({
      where: { id },
      select: { id: true, title: true, ownerId: true, deletedAt: true },
    });
    return ws ? { id: ws.id, title: ws.title, ownerId: ws.ownerId, deletedAt: ws.deletedAt } : null;
  }
  if (kind === "LESSON") {
    const l = await prisma.lesson.findUnique({
      where: { id },
      select: { id: true, title: true, ownerId: true, deletedAt: true },
    });
    return l;
  }
  const it = await prisma.lessonItem.findUnique({
    where: { id },
    select: { id: true, title: true, deletedAt: true, lessonId: true, lesson: { select: { ownerId: true } } },
  });
  return it ? { id: it.id, title: it.title, ownerId: it.lesson.ownerId, deletedAt: it.deletedAt, lessonId: it.lessonId } : null;
}

// ---------------------------------------------------------------------------
// Move to trash
// ---------------------------------------------------------------------------

export async function trashWorksheet(actor: Actor, worksheetId: string, source: TrashSource = "USER") {
  const ws = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    select: { id: true, title: true, ownerId: true, deletedAt: true },
  });
  if (!ws || ws.deletedAt) throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  assertOwner(actor, ws.ownerId, "Bạn không có quyền chỉnh sửa phiếu bài tập này.");

  if (source === "USER") {
    const submissions = await prisma.submission.count({
      where: { assignment: { worksheetId, class: { deletedAt: null } } },
    });
    if (submissions > 0) {
      throw new AppError(
        `Worksheet đã có ${submissions} bài làm của học sinh. Hãy xoá các bài tập đã giao trước nếu thật sự muốn xoá worksheet.`,
        409,
        "WORKSHEET_HAS_SUBMISSIONS"
      );
    }
    // assignments nobody has started in active classes are removed with the worksheet (as before the trash existed)
    await prisma.assignment.deleteMany({
      where: { worksheetId, class: { deletedAt: null }, submissions: { none: {} } },
    });
  }

  await prisma.worksheet.update({
    where: { id: worksheetId },
    data: { deletedAt: new Date(), deletedSource: source },
  });
  if (source === "USER") {
    await moveFilesToDriveTrash(await driveFilesFor(worksheetId, await worksheetFileKeys(worksheetId)));
  }
  await logAudit({
    actorId: source === "USER" ? actor.id : null,
    action: "CONTENT_TRASHED",
    targetType: "WORKSHEET",
    targetId: worksheetId,
    summary:
      source === "USER"
        ? `Chuyển worksheet vào thùng rác: ${ws.title}`
        : `Worksheet vào thùng rác vì file bị xoá trên Google Drive: ${ws.title}`,
    summaryEn:
      source === "USER"
        ? `Moved worksheet to trash: ${ws.title}`
        : `Worksheet moved to trash because its file was deleted in Google Drive: ${ws.title}`,
    meta: { title: ws.title, ownerId: ws.ownerId, source },
  });
}

/**
 * Moves a class to the trash: hidden from teacher, students and parents (like it no longer exists),
 * everything kept until it is restored or purged after 30 days. Lessons stay in the teacher's library.
 */
export async function trashClass(actor: Actor, classId: string) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, teacherId: true, deletedAt: true },
  });
  if (!cls || cls.deletedAt) throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  assertOwner(actor, cls.teacherId, "Bạn không có quyền quản lý lớp học này.");
  await prisma.class.update({ where: { id: classId }, data: { deletedAt: new Date() } });
  await logAudit({
    actorId: actor.id,
    action: "CONTENT_TRASHED",
    targetType: "CLASS",
    targetId: classId,
    summary: `Chuyển lớp vào thùng rác: ${cls.name}`,
    summaryEn: `Moved class to trash: ${cls.name}`,
    meta: { className: cls.name, teacherId: cls.teacherId },
  });
}

export async function trashLesson(actor: Actor, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, title: true, ownerId: true, deletedAt: true },
  });
  if (!lesson || lesson.deletedAt) throw new AppError("Không tìm thấy chương bài giảng.", 404, "NOT_FOUND");
  assertOwner(actor, lesson.ownerId, "Bạn không có quyền chỉnh sửa bài giảng này.");

  await prisma.lesson.update({ where: { id: lessonId }, data: { deletedAt: new Date(), deletedSource: "USER" } });
  await moveFilesToDriveTrash(await driveFilesFor(null, await lessonItemFileKeys({ lessonId })));
  await logAudit({
    actorId: actor.id,
    action: "CONTENT_TRASHED",
    targetType: "SYSTEM",
    targetId: lessonId,
    summary: `Chuyển bài giảng vào thùng rác: ${lesson.title}`,
    summaryEn: `Moved lesson to trash: ${lesson.title}`,
    meta: { kind: "LESSON", title: lesson.title, ownerId: lesson.ownerId },
  });
}

export async function trashLessonItem(
  actor: Actor,
  lessonId: string,
  itemId: string,
  source: TrashSource = "USER"
) {
  const item = await prisma.lessonItem.findFirst({
    where: { id: itemId, lessonId, deletedAt: null },
    select: { id: true, title: true, lesson: { select: { ownerId: true, deletedAt: true } } },
  });
  if (!item || item.lesson.deletedAt) throw new AppError("Không tìm thấy tài liệu.", 404, "NOT_FOUND");
  assertOwner(actor, item.lesson.ownerId, "Bạn không có quyền chỉnh sửa bài giảng này.");

  await prisma.lessonItem.update({ where: { id: itemId }, data: { deletedAt: new Date(), deletedSource: source } });
  if (source === "USER") {
    await moveFilesToDriveTrash(await driveFilesFor(null, await lessonItemFileKeys({ id: itemId })));
  }
}

// ---------------------------------------------------------------------------
// Trash list, restore, delete forever
// ---------------------------------------------------------------------------

export interface TrashEntry {
  kind: TrashKind;
  id: string;
  title: string;
  /** lesson title for a material */
  parentTitle: string | null;
  ownerName: string | null;
  deletedAt: string;
  source: TrashSource;
  daysLeft: number;
}

function daysLeft(deletedAt: Date, now = Date.now()) {
  return Math.max(0, Math.ceil((deletedAt.getTime() + CONTENT_TRASH_DAYS * DAY_MS - now) / DAY_MS));
}

export async function listTrash(actor: Actor): Promise<TrashEntry[]> {
  const mine = actor.role === "ADMIN" ? {} : { ownerId: actor.id };
  const classes = await prisma.class.findMany({
    where: { ...(actor.role === "ADMIN" ? {} : { teacherId: actor.id }), deletedAt: { not: null } },
    select: { id: true, name: true, deletedAt: true, teacher: { select: { name: true } } },
  });
  const [worksheets, lessons, items] = await Promise.all([
    prisma.worksheet.findMany({
      where: { ...mine, deletedAt: { not: null } },
      select: { id: true, title: true, deletedAt: true, deletedSource: true, owner: { select: { name: true } } },
    }),
    prisma.lesson.findMany({
      where: { ...mine, deletedAt: { not: null } },
      select: { id: true, title: true, deletedAt: true, deletedSource: true, owner: { select: { name: true } } },
    }),
    // materials deleted on their own (their lesson is still in the library)
    prisma.lessonItem.findMany({
      where: { deletedAt: { not: null }, lesson: { ...mine, deletedAt: null } },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        deletedSource: true,
        lesson: { select: { title: true, owner: { select: { name: true } } } },
      },
    }),
  ]);
  const src = (s: string | null): TrashSource => (s === "DRIVE" ? "DRIVE" : "USER");
  const rows: TrashEntry[] = [
    ...classes.map((c) => ({
      kind: "CLASS" as const,
      id: c.id,
      title: c.name,
      parentTitle: null,
      ownerName: c.teacher?.name ?? null,
      deletedAt: c.deletedAt!.toISOString(),
      source: "USER" as const,
      daysLeft: daysLeft(c.deletedAt!),
    })),
    ...worksheets.map((w) => ({
      kind: "WORKSHEET" as const,
      id: w.id,
      title: w.title,
      parentTitle: null,
      ownerName: w.owner?.name ?? null,
      deletedAt: w.deletedAt!.toISOString(),
      source: src(w.deletedSource),
      daysLeft: daysLeft(w.deletedAt!),
    })),
    ...lessons.map((l) => ({
      kind: "LESSON" as const,
      id: l.id,
      title: l.title,
      parentTitle: null,
      ownerName: l.owner?.name ?? null,
      deletedAt: l.deletedAt!.toISOString(),
      source: src(l.deletedSource),
      daysLeft: daysLeft(l.deletedAt!),
    })),
    ...items.map((i) => ({
      kind: "LESSON_ITEM" as const,
      id: i.id,
      title: i.title,
      parentTitle: i.lesson.title,
      ownerName: i.lesson.owner?.name ?? null,
      deletedAt: i.deletedAt!.toISOString(),
      source: src(i.deletedSource),
      daysLeft: daysLeft(i.deletedAt!),
    })),
  ];
  return rows.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** Restores an item and its Drive files. Returns how many files no longer exist on Drive. */
export async function restoreFromTrash(actor: Actor, kind: TrashKind, id: string) {
  const item = await loadItem(kind, id);
  if (!item || !item.deletedAt) throw new AppError("Không tìm thấy mục trong thùng rác.", 404, "NOT_FOUND");
  assertOwner(actor, item.ownerId, "Bạn không có quyền khôi phục mục này.");

  let missingFiles = 0;
  if (kind === "CLASS") {
    await prisma.class.update({ where: { id }, data: { deletedAt: null } });
    const trashedWorksheets = await prisma.worksheet.findMany({
      where: { deletedAt: { not: null }, assignments: { some: { classId: id } } },
      select: { id: true },
    });
    for (const ws of trashedWorksheets) {
      await prisma.worksheet.update({ where: { id: ws.id }, data: { deletedAt: null, deletedSource: null } });
      missingFiles += await restoreFilesFromDriveTrash(await driveFilesFor(ws.id, await worksheetFileKeys(ws.id)));
    }
  } else if (kind === "WORKSHEET") {
    await prisma.worksheet.update({ where: { id }, data: { deletedAt: null, deletedSource: null } });
    missingFiles = await restoreFilesFromDriveTrash(await driveFilesFor(id, await worksheetFileKeys(id)));
  } else if (kind === "LESSON") {
    await prisma.lesson.update({ where: { id }, data: { deletedAt: null, deletedSource: null } });
    missingFiles = await restoreFilesFromDriveTrash(await driveFilesFor(null, await lessonItemFileKeys({ lessonId: id })));
  } else {
    await prisma.lessonItem.update({ where: { id }, data: { deletedAt: null, deletedSource: null } });
    missingFiles = await restoreFilesFromDriveTrash(await driveFilesFor(null, await lessonItemFileKeys({ id })));
  }
  await logAudit({
    actorId: actor.id === SYSTEM.id ? null : actor.id,
    action: "CONTENT_RESTORED",
    targetType: kind === "WORKSHEET" ? "WORKSHEET" : kind === "CLASS" ? "CLASS" : "SYSTEM",
    targetId: id,
    summary: `Khôi phục từ thùng rác: ${item.title}`,
    summaryEn: `Restored from trash: ${item.title}`,
    meta: { kind, title: item.title, missingFiles },
  });
  return { missingFiles };
}

/** Deletes an item in the trash for good (files stay in Drive's own trash until it empties). */
export async function deleteForever(actor: Actor, kind: TrashKind, id: string) {
  const item = await loadItem(kind, id);
  if (!item || !item.deletedAt) throw new AppError("Không tìm thấy mục trong thùng rác.", 404, "NOT_FOUND");
  assertOwner(actor, item.ownerId, "Bạn không có quyền xoá mục này.");

  if (kind === "CLASS") {
    // assignments, submissions, posts and enrollments go with the class; lessons stay in the library
    await deleteClass(id, actor.id === SYSTEM.id ? undefined : actor.id);
    return;
  }
  if (kind === "WORKSHEET") {
    await deleteWorksheet(id, actor.id === SYSTEM.id ? undefined : actor.id);
    return;
  }
  const keys =
    kind === "LESSON" ? await lessonItemFileKeys({ lessonId: id }) : await lessonItemFileKeys({ id });
  const driveRows = await prisma.driveFile.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true } });
  const onDrive = new Set(driveRows.map((r) => r.storageKey));
  if (kind === "LESSON") await prisma.lesson.delete({ where: { id } });
  else await prisma.lessonItem.delete({ where: { id } });
  // Drive copies are already in Drive's trash; forget them. Local / S3 copies are removed now.
  await prisma.driveFile.deleteMany({ where: { storageKey: { in: keys } } });
  const storage = getStorageProvider();
  for (const key of keys.filter((k) => !onDrive.has(k))) {
    await storage.delete(key).catch(() => undefined);
  }
}

/** Deletes everything that has been in the trash longer than CONTENT_TRASH_DAYS. */
export async function purgeExpiredContentTrash(now = new Date()) {
  const cutoff = new Date(now.getTime() - CONTENT_TRASH_DAYS * DAY_MS);
  const classes = await prisma.class.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } });
  const [worksheets, lessons, items] = await Promise.all([
    prisma.worksheet.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } }),
    prisma.lesson.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } }),
    prisma.lessonItem.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } }),
  ]);
  let purged = 0;
  const run = async (kind: TrashKind, id: string) => {
    try {
      await deleteForever(SYSTEM, kind, id);
      purged++;
    } catch (err) {
      console.error(`[Trash] purge ${kind} ${id} failed:`, err instanceof Error ? err.message : "unknown");
    }
  };
  for (const c of classes) await run("CLASS", c.id);
  for (const w of worksheets) await run("WORKSHEET", w.id);
  for (const l of lessons) await run("LESSON", l.id);
  for (const i of items) await run("LESSON_ITEM", i.id);
  return purged;
}

// ---------------------------------------------------------------------------
// Sync with Google Drive's trash
// ---------------------------------------------------------------------------

export interface TrashSyncResult {
  trashedFromDrive: number;
  restoredFromDrive: number;
  failedConnections: number;
}

/**
 * - Files trashed directly in Drive → their worksheet / lesson material goes to Pivora's trash.
 * - Files Pivora trashed that someone restored in Drive → the item is restored in Pivora.
 */
export async function syncTrashWithDrive(): Promise<TrashSyncResult> {
  const result: TrashSyncResult = { trashedFromDrive: 0, restoredFromDrive: 0, failedConnections: 0 };
  const connections = await prisma.driveConnection.findMany({ where: { status: "ACTIVE" }, select: { id: true } });

  for (const conn of connections) {
    let trashedIds: Set<string>;
    try {
      trashedIds = new Set(await listTrashedDriveFileIds(conn.id));
    } catch (err) {
      result.failedConnections++;
      console.error("[Trash sync] listing failed:", err instanceof Error ? err.message : "unknown");
      continue;
    }

    // 1. trashed in Drive, still live in Pivora
    const newlyTrashed = trashedIds.size
      ? await prisma.driveFile.findMany({
          where: {
            connectionId: conn.id,
            trashedAt: null,
            softTrashedAt: null,
            driveFileId: { in: [...trashedIds] },
            kind: { in: ["WORKSHEET_PDF", "WORKSHEET_AUDIO", "LESSON_FILE"] as DriveFileKind[] },
          },
          select: { id: true, storageKey: true, worksheetId: true, kind: true },
        })
      : [];
    for (const f of newlyTrashed) {
      await prisma.driveFile.update({ where: { id: f.id }, data: { softTrashedAt: new Date() } });
      if (f.kind !== "LESSON_FILE" && f.worksheetId) {
        const ws = await prisma.worksheet.findUnique({ where: { id: f.worksheetId }, select: { deletedAt: true } });
        if (ws && !ws.deletedAt) {
          await trashWorksheet(SYSTEM, f.worksheetId, "DRIVE");
          result.trashedFromDrive++;
        }
      } else if (f.kind === "LESSON_FILE") {
        const items = await prisma.lessonItem.findMany({
          where: { fileKey: f.storageKey, deletedAt: null },
          select: { id: true, lessonId: true },
        });
        for (const it of items) {
          await trashLessonItem(SYSTEM, it.lessonId, it.id, "DRIVE");
          result.trashedFromDrive++;
        }
      }
    }

    // 2. restored in Drive while the item is in Pivora's trash
    const softTrashed = await prisma.driveFile.findMany({
      where: { connectionId: conn.id, trashedAt: null, softTrashedAt: { not: null } },
      select: { id: true, driveFileId: true, storageKey: true, worksheetId: true, kind: true },
    });
    for (const f of softTrashed.filter((x) => !trashedIds.has(x.driveFileId))) {
      await prisma.driveFile.update({ where: { id: f.id }, data: { softTrashedAt: null } });
      if (f.kind !== "LESSON_FILE" && f.worksheetId) {
        const ws = await prisma.worksheet.findUnique({ where: { id: f.worksheetId }, select: { deletedAt: true } });
        if (ws?.deletedAt) {
          await restoreFromTrash(SYSTEM, "WORKSHEET", f.worksheetId);
          result.restoredFromDrive++;
        }
      } else if (f.kind === "LESSON_FILE") {
        const items = await prisma.lessonItem.findMany({
          where: { fileKey: f.storageKey, deletedAt: { not: null } },
          select: { id: true },
        });
        for (const it of items) {
          await restoreFromTrash(SYSTEM, "LESSON_ITEM", it.id);
          result.restoredFromDrive++;
        }
      }
    }
  }
  return result;
}
