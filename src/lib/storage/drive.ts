import { createHash } from "node:crypto";
import path from "node:path";
import type { DriveFileKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  downloadDriveBuffer,
  downloadDriveStream,
  ensureFolderByKey,
  ensureRootFolder,
  sanitizeDriveName,
  SHARED_SCOPE_KEY,
  trashDriveFile,
  uploadBufferToDrive,
  userScopeKey,
} from "@/lib/drive/google-drive";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type {
  StorageGetResult,
  StorageProvider,
  StoragePutOptions,
  StoragePutResult,
  StorageStreamResult,
} from "./types";

export interface FolderStep {
  key: string;
  name: string;
}

export interface DrivePlacementPlan {
  ownerId: string | null;
  kind: DriveFileKind;
  worksheetId: string | null;
  classId: string | null;
  submissionId: string | null;
  folders: FolderStep[];
  fileName: string;
}

function todayYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Pure helper to build the EngClass Drive folder hierarchy (PLAN 12.4):
 *   EngClass/
 *   └── <Teacher Name>/
 *       ├── Worksheets/<Worksheet Title>/           (de.pdf, audio-1.mp3, nguon.docx)
 *       ├── Backups/<yyyy-mm-dd>/                   (<Worksheet>.engclass.zip, thu-vien.zip)
 *       └── Lớp <Class Name>/<Assignment>/<Student> (submission files, private)
 */
export function buildDriveFolderSteps(input: {
  kind: DriveFileKind;
  teacherKey: string;
  teacherName: string;
  worksheetId?: string | null;
  worksheetTitle?: string | null;
  classId?: string | null;
  className?: string | null;
  assignmentId?: string | null;
  assignmentTitle?: string | null;
  studentId?: string | null;
  studentName?: string | null;
  dateYmd?: string;
}): FolderStep[] {
  const teacherStep: FolderStep = {
    key: `teacher:${input.teacherKey}`,
    name: sanitizeDriveName(input.teacherName || "Giáo viên", 80),
  };

  if (
    input.kind === "WORKSHEET_PDF" ||
    input.kind === "WORKSHEET_AUDIO" ||
    input.kind === "WORD_SOURCE"
  ) {
    const wsKey = input.worksheetId ?? "general";
    return [
      teacherStep,
      { key: `ws-root:${input.teacherKey}`, name: "Worksheets" },
      {
        key: `ws:${wsKey}`,
        name: sanitizeDriveName(input.worksheetTitle || `Worksheet ${wsKey}`, 100),
      },
    ];
  }

  if (input.kind === "BACKUP") {
    const ymd = input.dateYmd ?? todayYmd();
    return [
      teacherStep,
      { key: `backups-root:${input.teacherKey}`, name: "Backups" },
      { key: `backup-date:${input.teacherKey}:${ymd}`, name: ymd },
    ];
  }

  if (input.kind === "SUBMISSION_FILE") {
    const clsKey = input.classId ?? "general";
    const asgKey = input.assignmentId ?? "general";
    const stuKey = input.studentId ?? "student";
    return [
      teacherStep,
      {
        key: `class:${clsKey}`,
        name: sanitizeDriveName(`Lớp ${input.className || clsKey}`, 100),
      },
      {
        key: `asg:${asgKey}`,
        name: sanitizeDriveName(input.assignmentTitle || `Bài tập ${asgKey}`, 100),
      },
      {
        key: `sub-student:${asgKey}:${stuKey}`,
        name: sanitizeDriveName(input.studentName || "Học sinh", 100),
      },
    ];
  }

  // LESSON_FILE
  const clsKey = input.classId ?? "general";
  return [
    teacherStep,
    {
      key: `class:${clsKey}`,
      name: sanitizeDriveName(`Lớp ${input.className || clsKey}`, 100),
    },
    { key: `lessons:${clsKey}`, name: "Bài giảng" },
  ];
}

/**
 * Resolves the active DriveConnection following PLAN 12.2b priority:
 *   1. Teacher's personal Drive (ownerId = ownerId)
 *   2. School shared Drive (scopeKey = "shared")
 *   3. null (caller falls back to local / s3)
 */
export async function resolveActiveDriveConnection(ownerId?: string | null) {
  if (ownerId) {
    const personal = await prisma.driveConnection.findUnique({
      where: { scopeKey: userScopeKey(ownerId) },
    });
    if (personal && personal.status === "ACTIVE" && personal.encryptedRefreshToken) {
      return personal;
    }
  }

  const shared = await prisma.driveConnection.findUnique({
    where: { scopeKey: SHARED_SCOPE_KEY },
  });
  if (shared && shared.status === "ACTIVE" && shared.encryptedRefreshToken) {
    return shared;
  }

  return null;
}

/**
 * Infers Drive folder structure & metadata from a storageKey + optional StoragePutOptions.
 */
export async function resolveDrivePlacement(
  storageKey: string,
  contentType: string,
  options?: StoragePutOptions
): Promise<DrivePlacementPlan> {
  const segments = storageKey.replace(/^\/+/, "").split("/");
  const baseName = path.basename(storageKey);

  let kind: DriveFileKind = options?.kind ?? "LESSON_FILE";
  let ownerId: string | null = options?.ownerId ?? null;
  let worksheetId: string | null = options?.worksheetId ?? null;
  let classId: string | null = options?.classId ?? null;
  let submissionId: string | null = options?.submissionId ?? null;
  let teacherName = options?.teacherName ?? "";
  let worksheetTitle = options?.worksheetTitle ?? "";
  let className = options?.className ?? "";
  let assignmentId: string | null = null;
  let assignmentTitle = options?.assignmentTitle ?? "";
  let studentId: string | null = null;
  let studentName = options?.studentName ?? "";
  let fileName = options?.fileName ?? baseName;

  if (!options?.kind) {
    if (segments[0] === "worksheets" && segments[2] === "audio") {
      kind = "WORKSHEET_AUDIO";
      worksheetId = worksheetId ?? segments[1] ?? null;
    } else if (segments[0] === "worksheets") {
      kind =
        contentType === "application/pdf"
          ? "WORKSHEET_PDF"
          : contentType.startsWith("audio/")
            ? "WORKSHEET_AUDIO"
            : "WORD_SOURCE";
      worksheetId = worksheetId ?? segments[1] ?? null;
    } else if (segments[0] === "audio") {
      kind = "WORKSHEET_AUDIO";
      worksheetId = worksheetId ?? segments[1] ?? null;
    } else if (segments[0] === "backups") {
      kind = "BACKUP";
      ownerId = ownerId ?? segments[1] ?? null;
    } else if (segments[0] === "lessons") {
      kind = "LESSON_FILE";
      classId = classId ?? segments[1] ?? null;
    } else if (segments[0] === "proctor" || segments[0] === "submissions") {
      kind = "SUBMISSION_FILE";
      submissionId = submissionId ?? segments[1] ?? null;
    }
  }

  if (worksheetId && (!ownerId || !worksheetTitle || !teacherName)) {
    const ws = await prisma.worksheet.findUnique({
      where: { id: worksheetId },
      select: {
        title: true,
        ownerId: true,
        owner: { select: { name: true } },
        _count: { select: { audios: true } },
      },
    });
    if (ws) {
      ownerId = ownerId ?? ws.ownerId;
      worksheetTitle = worksheetTitle || ws.title;
      teacherName = teacherName || ws.owner.name;
      if (!options?.fileName) {
        if (kind === "WORKSHEET_PDF") {
          fileName = "de.pdf";
        } else if (kind === "WORD_SOURCE") {
          fileName = "nguon.docx";
        } else if (kind === "WORKSHEET_AUDIO") {
          const ext = path.extname(baseName) || ".mp3";
          fileName = `audio-${ws._count.audios + 1}${ext}`;
        }
      }
    }
  }

  if (classId && (!ownerId || !className || !teacherName)) {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { name: true, teacherId: true, teacher: { select: { name: true } } },
    });
    if (cls) {
      ownerId = ownerId ?? cls.teacherId;
      className = className || cls.name;
      teacherName = teacherName || cls.teacher.name;
    }
  }

  if (submissionId) {
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        studentId: true,
        student: { select: { name: true } },
        assignment: {
          select: {
            id: true,
            title: true,
            classId: true,
            class: {
              select: {
                name: true,
                teacherId: true,
                teacher: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (sub) {
      studentId = sub.studentId;
      studentName = studentName || sub.student.name;
      assignmentId = sub.assignment.id;
      assignmentTitle = assignmentTitle || sub.assignment.title;
      classId = classId ?? sub.assignment.classId;
      className = className || sub.assignment.class.name;
      ownerId = ownerId ?? sub.assignment.class.teacherId;
      teacherName = teacherName || sub.assignment.class.teacher.name;
    }
  }

  if (ownerId && !teacherName) {
    const user = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { name: true },
    });
    if (user) {
      teacherName = user.name;
    }
  }

  const folders = buildDriveFolderSteps({
    kind,
    teacherKey: ownerId ?? "shared",
    teacherName: teacherName || "Giáo viên",
    worksheetId,
    worksheetTitle,
    classId,
    className,
    assignmentId,
    assignmentTitle,
    studentId,
    studentName,
  });

  return {
    ownerId,
    kind,
    worksheetId,
    classId,
    submissionId,
    folders,
    fileName: sanitizeDriveName(fileName, 160),
  };
}

export class DriveStorageProvider implements StorageProvider {
  private readonly fallback: StorageProvider;

  constructor(fallback?: StorageProvider) {
    if (fallback) {
      this.fallback = fallback;
    } else if ((process.env.DRIVE_FALLBACK_DRIVER ?? "local").toLowerCase() === "s3") {
      this.fallback = new S3StorageProvider();
    } else {
      this.fallback = new LocalStorageProvider();
    }
  }

  async put(
    key: string,
    data: Buffer,
    contentType: string,
    options?: StoragePutOptions
  ): Promise<StoragePutResult> {
    const plan = await resolveDrivePlacement(key, contentType, options);
    const connection = await resolveActiveDriveConnection(plan.ownerId);

    if (!connection) {
      console.warn(
        `[Storage] STORAGE_DRIVER=drive active, but no Google Drive connection is active (key=${key}); falling back to local storage.`
      );
      return this.fallback.put(key, data, contentType, options);
    }

    let rootFolderId = await ensureRootFolder(connection.id);
    let parentId = rootFolderId;
    try {
      for (const step of plan.folders) {
        parentId = await ensureFolderByKey(connection.id, step.key, step.name, parentId);
      }
    } catch (err) {
      // Root folder may have been deleted externally; recreate once if 404
      if (err instanceof Error && "statusCode" in err && (err as { statusCode: number }).statusCode === 404) {
        rootFolderId = await ensureRootFolder(connection.id, true);
        parentId = rootFolderId;
        for (const step of plan.folders) {
          parentId = await ensureFolderByKey(connection.id, step.key, step.name, parentId);
        }
      } else {
        throw err;
      }
    }

    const remote = await uploadBufferToDrive(connection.id, {
      name: plan.fileName,
      mimeType: contentType,
      data,
      parentId,
      appProperties: {
        engclassKey: key.slice(0, 110),
        engclassKind: plan.kind,
      },
    });

    const md5 = remote.md5Checksum ?? createHash("md5").update(data).digest("hex");

    const existing = await prisma.driveFile.findUnique({
      where: { storageKey: key },
      select: { id: true, driveFileId: true, connectionId: true },
    });

    if (existing && existing.driveFileId !== remote.id) {
      await prisma.driveTrash.create({
        data: {
          driveFileId: existing.driveFileId,
          connectionId: existing.connectionId,
          storageKey: key,
          reason: "REPLACED",
        },
      });
    }

    await prisma.driveFile.upsert({
      where: { storageKey: key },
      create: {
        storageKey: key,
        driveFileId: remote.id,
        connectionId: connection.id,
        ownerId: plan.ownerId,
        name: plan.fileName,
        mimeType: contentType,
        size: data.byteLength,
        md5,
        kind: plan.kind,
        worksheetId: plan.worksheetId,
        classId: plan.classId,
        submissionId: plan.submissionId,
        shared: false,
      },
      update: {
        driveFileId: remote.id,
        connectionId: connection.id,
        ownerId: plan.ownerId,
        name: plan.fileName,
        mimeType: contentType,
        size: data.byteLength,
        md5,
        kind: plan.kind,
        worksheetId: plan.worksheetId,
        classId: plan.classId,
        submissionId: plan.submissionId,
        trashedAt: null,
      },
    });

    return {
      key,
      size: data.byteLength,
      contentType,
      driver: "drive",
      driveFileId: remote.id,
    };
  }

  async get(key: string): Promise<StorageGetResult | null> {
    const record = await prisma.driveFile.findUnique({
      where: { storageKey: key },
    });
    if (record && !record.trashedAt) {
      const downloaded = await downloadDriveBuffer(record.connectionId, record.driveFileId);
      return {
        buffer: downloaded.buffer,
        contentType: record.mimeType || downloaded.contentType,
        size: downloaded.size,
      };
    }
    return this.fallback.get(key);
  }

  async getStream(key: string, range?: string | null): Promise<StorageStreamResult | null> {
    const record = await prisma.driveFile.findUnique({
      where: { storageKey: key },
    });
    if (record && !record.trashedAt) {
      const upstream = await downloadDriveStream(
        record.connectionId,
        record.driveFileId,
        range
      );
      if (!upstream.body) {
        return null;
      }
      const lenHeader = upstream.headers.get("content-length");
      const rangeHeader = upstream.headers.get("content-range");
      return {
        stream: upstream.body,
        contentType: record.mimeType || upstream.headers.get("content-type") || "application/octet-stream",
        status: upstream.status === 206 ? 206 : 200,
        contentLength: lenHeader ? Number(lenHeader) : undefined,
        contentRange: rangeHeader ?? undefined,
      };
    }
    if (this.fallback.getStream) {
      return this.fallback.getStream(key, range);
    }
    const buf = await this.fallback.get(key);
    if (!buf) return null;
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(buf.buffer));
          controller.close();
        },
      }),
      contentType: buf.contentType,
      status: 200,
      contentLength: buf.size,
    };
  }

  async delete(key: string): Promise<void> {
    const record = await prisma.driveFile.findUnique({
      where: { storageKey: key },
    });
    if (record) {
      // Queue for trash (never permanently delete on Drive; PLAN 12.3 & 12.6)
      await prisma.driveFile.update({
        where: { id: record.id },
        data: { trashedAt: new Date() },
      });
      const trashRow = await prisma.driveTrash.create({
        data: {
          driveFileId: record.driveFileId,
          connectionId: record.connectionId,
          storageKey: key,
          reason: "DELETED",
        },
      });
      // Best-effort immediate move to Drive trash; if offline/failed, pruneDrive retries hourly
      try {
        await trashDriveFile(record.connectionId, record.driveFileId);
        await prisma.driveTrash.delete({ where: { id: trashRow.id } }).catch(() => undefined);
      } catch {
        // Leave queued in DriveTrash for background prune job
      }
    }
    await this.fallback.delete(key).catch(() => undefined);
  }

  async exists(key: string): Promise<boolean> {
    const record = await prisma.driveFile.findUnique({
      where: { storageKey: key },
      select: { id: true, trashedAt: true },
    });
    if (record && !record.trashedAt) return true;
    return this.fallback.exists(key);
  }
}
