import crypto from "node:crypto";
import path from "node:path";
import type { DriveFileKind } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { SessionUser } from "@/lib/permissions";
import {
  appOrigin,
  buildAuthorizationUrl,
  cancelResumableUpload,
  clearAccessTokenCache,
  decryptSecret,
  DRIVE_CHUNK_SIZE,
  DRIVE_SCOPE,
  drivePreviewUrl,
  encryptSecret,
  ensureFolderByKey,
  ensurePublicReader,
  ensureRootFolder,
  exchangeAuthorizationCode,
  getAccessTokenForConnection,
  getDriveAbout,
  getDriveAboutWithToken,
  getDriveFileMetadata,
  isDriveConfigured,
  listDriveFolderFiles,
  newOAuthState,
  newPkceVerifier,
  pkceChallenge,
  placeDriveFile,
  queryResumableUpload,
  readDriveFileHead,
  rememberAccessToken,
  revokePublicReader,
  revokeToken,
  sanitizeDriveName,
  SHARED_SCOPE_KEY,
  startResumableUpload,
  statesMatch,
  trashDriveFile,
  uploadBufferToDrive,
  userScopeKey,
  downloadDriveBuffer,
  downloadDriveStream,
  type DriveAboutInfo,
  type DriveRemoteFile,
} from "@/lib/drive/google-drive";
import {
  buildDriveFolderSteps,
  resolveActiveDriveConnection,
} from "@/lib/storage/drive";
import { getActiveStorageDriver } from "@/lib/storage";
import { authorizeFileDownload, createWorksheet, uploadWorksheetPdf, saveWorksheetFields } from "./worksheetService";
import {
  exportAllTeacherWorksheetsZip,
  exportWorksheetAsZip,
  importWorksheetFile,
  parseWordOrTextFile,
} from "./worksheetTransferService";

export const OAUTH_COOKIE_NAME = "engclass_drive_oauth";
const SESSION_LIFETIME_MS = 6 * 24 * 60 * 60 * 1000; // 6 days (Drive resumable sessions live 7 days)
const MAX_VIDEO_BYTES = 5 * 1024 ** 3; // 5 GiB
const MAX_DOC_BYTES = 1024 ** 3; // 1 GiB

const DIRECT_UPLOAD_FORMATS: Record<string, { mime: string; kind: "video" | "document" }> = {
  mp4: { mime: "video/mp4", kind: "video" },
  webm: { mime: "video/webm", kind: "video" },
  mov: { mime: "video/quicktime", kind: "video" },
  pdf: { mime: "application/pdf", kind: "document" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "document",
  },
  jpg: { mime: "image/jpeg", kind: "document" },
  jpeg: { mime: "image/jpeg", kind: "document" },
  png: { mime: "image/png", kind: "document" },
  webp: { mime: "image/webp", kind: "document" },
  mp3: { mime: "audio/mpeg", kind: "document" },
  wav: { mime: "audio/wav", kind: "document" },
  ogg: { mime: "audio/ogg", kind: "document" },
  m4a: { mime: "audio/mp4", kind: "document" },
};

export function matchesMagicSignature(mime: string, data: Buffer): boolean {
  const ascii = (from: number, to: number) => data.subarray(from, to).toString("latin1");
  switch (mime) {
    case "application/pdf":
      return ascii(0, 5) === "%PDF-";
    case "image/jpeg":
      return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    case "image/png":
      return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
    case "video/mp4":
    case "video/quicktime":
    case "audio/mp4":
      return ["ftyp", "moov", "mdat", "free", "wide"].includes(ascii(4, 8));
    case "video/webm":
      return data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case "audio/mpeg":
      return ascii(0, 3) === "ID3" || (data[0] === 0xff && ((data[1] ?? 0) & 0xe0) === 0xe0);
    case "audio/wav":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
    case "audio/ogg":
      return ascii(0, 4) === "OggS";
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Connection Status & OAuth (Shared Admin + Personal Teacher)
// ---------------------------------------------------------------------------
export interface DriveConnectionSummary {
  connected: boolean;
  status: "ACTIVE" | "REVOKED" | "DISCONNECTED" | "NOT_CONNECTED";
  email?: string;
  allowPublicLessonVideos?: boolean;
  autoBackupEnabled?: boolean;
  lastAutoBackupAt?: string | null;
  quota?: {
    usageBytes: number | null;
    limitBytes: number | null;
  } | null;
}

export interface DriveStatusPayload {
  configured: boolean;
  pickerConfigured: boolean;
  storageDriver: "local" | "s3" | "drive";
  effectiveSource: "personal" | "shared" | "local" | "s3";
  canConnectShared: boolean;
  canConnectPersonal: boolean;
  shared: DriveConnectionSummary;
  personal?: DriveConnectionSummary;
}

function isPickerConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() &&
      process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY?.trim()
  );
}

export async function getDriveStatusForUser(
  user: SessionUser,
  options?: { includeQuota?: boolean }
): Promise<DriveStatusPayload> {
  const configured = isDriveConfigured();
  const storageDriver = getActiveStorageDriver();
  const isAdmin = user.role === "ADMIN";
  const isTeacherOrAdmin = user.role === "TEACHER" || isAdmin;

  const [sharedRow, personalRow] = await Promise.all([
    prisma.driveConnection.findUnique({ where: { scopeKey: SHARED_SCOPE_KEY } }),
    isTeacherOrAdmin
      ? prisma.driveConnection.findUnique({ where: { scopeKey: userScopeKey(user.id) } })
      : Promise.resolve(null),
  ]);

  let sharedQuota: DriveAboutInfo | null = null;
  let personalQuota: DriveAboutInfo | null = null;

  if (options?.includeQuota && configured) {
    if (isAdmin && sharedRow?.status === "ACTIVE") {
      sharedQuota = await getDriveAbout(sharedRow.id).catch(() => null);
    }
    if (isTeacherOrAdmin && personalRow?.status === "ACTIVE") {
      personalQuota = await getDriveAbout(personalRow.id).catch(() => null);
    }
  }

  const sharedConnected = sharedRow?.status === "ACTIVE";
  const personalConnected = personalRow?.status === "ACTIVE";

  const effectiveSource: DriveStatusPayload["effectiveSource"] = personalConnected
    ? "personal"
    : sharedConnected
      ? "shared"
      : storageDriver === "s3"
        ? "s3"
        : "local";

  return {
    configured,
    pickerConfigured: isPickerConfigured(),
    storageDriver,
    effectiveSource,
    canConnectShared: isAdmin,
    canConnectPersonal: isTeacherOrAdmin,
    shared: {
      connected: Boolean(sharedConnected),
      status: sharedRow ? sharedRow.status : "NOT_CONNECTED",
      ...(isAdmin && sharedRow ? { email: sharedRow.email } : {}),
      ...(isAdmin && sharedRow
        ? { allowPublicLessonVideos: sharedRow.allowPublicLessonVideos }
        : {}),
      ...(sharedQuota
        ? {
            quota: {
              usageBytes: sharedQuota.usageBytes,
              limitBytes: sharedQuota.limitBytes,
            },
          }
        : {}),
    },
    ...(isTeacherOrAdmin
      ? {
          personal: {
            connected: Boolean(personalConnected),
            status: personalRow ? personalRow.status : "NOT_CONNECTED",
            ...(personalRow ? { email: personalRow.email } : {}),
            autoBackupEnabled: personalRow?.autoBackupEnabled ?? false,
            lastAutoBackupAt: personalRow?.lastAutoBackupAt?.toISOString() ?? null,
            ...(personalQuota
              ? {
                  quota: {
                    usageBytes: personalQuota.usageBytes,
                    limitBytes: personalQuota.limitBytes,
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

interface OAuthCookieData {
  state: string;
  verifier: string;
  scope: "shared" | "personal";
  userId: string;
}

export function beginDriveOAuth(
  request: Request,
  user: SessionUser,
  scope: "shared" | "personal"
): { authUrl: string; cookieValue: string; secure: boolean } {
  if (scope === "shared" && user.role !== "ADMIN") {
    throw new AppError(
      "Chỉ quản trị viên được kết nối tài khoản Google Drive dùng chung.",
      403,
      "FORBIDDEN"
    );
  }
  if (scope === "personal" && user.role !== "TEACHER" && user.role !== "ADMIN") {
    throw new AppError(
      "Chỉ giáo viên hoặc quản trị viên được kết nối Google Drive riêng.",
      403,
      "FORBIDDEN"
    );
  }

  const state = newOAuthState();
  const verifier = newPkceVerifier();
  const challenge = pkceChallenge(verifier);
  const authUrl = buildAuthorizationUrl(request, state, challenge);

  const payload: OAuthCookieData = { state, verifier, scope, userId: user.id };
  const cookieValue = encryptSecret(JSON.stringify(payload));
  const secure = appOrigin(request).startsWith("https://");

  return { authUrl, cookieValue, secure };
}

export async function completeDriveOAuthCallback(
  request: Request,
  user: SessionUser | null,
  rawCookie: string | undefined
): Promise<{ redirectTo: string }> {
  const url = new URL(request.url);
  let parsedCookie: OAuthCookieData | null = null;
  if (rawCookie) {
    try {
      parsedCookie = JSON.parse(decryptSecret(rawCookie)) as OAuthCookieData;
    } catch {
      parsedCookie = null;
    }
  }

  const targetPage = parsedCookie?.scope === "personal" ? "/teacher/settings" : "/admin";
  const done = (outcome: string) => ({
    redirectTo: new URL(`${targetPage}?drive=${outcome}`, appOrigin(request)).toString(),
  });

  if (!user) return done("login");
  if (!parsedCookie) return done("state");
  if (parsedCookie.userId !== user.id) return done("state");

  if (parsedCookie.scope === "shared" && user.role !== "ADMIN") return done("forbidden");
  if (parsedCookie.scope === "personal" && user.role !== "TEACHER" && user.role !== "ADMIN") {
    return done("forbidden");
  }

  if (url.searchParams.get("error")) return done("denied");

  const stateParam = url.searchParams.get("state");
  if (!statesMatch(parsedCookie.state, stateParam)) {
    return done("state");
  }

  const code = url.searchParams.get("code");
  if (!code) return done("error");

  try {
    const tokens = await exchangeAuthorizationCode(request, code, parsedCookie.verifier);
    if (!tokens.scope?.split(" ").includes(DRIVE_SCOPE)) {
      return done("scope");
    }
    if (!tokens.refresh_token) {
      return done("norefresh");
    }

    const about = await getDriveAboutWithToken(tokens.access_token);
    const scopeKey =
      parsedCookie.scope === "shared" ? SHARED_SCOPE_KEY : userScopeKey(user.id);
    const ownerId = parsedCookie.scope === "shared" ? null : user.id;

    const existing = await prisma.driveConnection.findUnique({ where: { scopeKey } });
    if (existing?.status === "ACTIVE" && existing.email !== about.email) {
      return done("different-account");
    }

    const reuseFolderId =
      existing && existing.email === about.email ? existing.rootFolderId : null;

    const conn = await prisma.driveConnection.upsert({
      where: { scopeKey },
      create: {
        scopeKey,
        ownerId,
        connectedById: user.id,
        email: about.email,
        encryptedRefreshToken: encryptSecret(tokens.refresh_token),
        scope: DRIVE_SCOPE,
        status: "ACTIVE",
        rootFolderId: reuseFolderId,
      },
      update: {
        connectedById: user.id,
        email: about.email,
        encryptedRefreshToken: encryptSecret(tokens.refresh_token),
        scope: DRIVE_SCOPE,
        status: "ACTIVE",
        rootFolderId: reuseFolderId,
      },
    });

    clearAccessTokenCache(conn.id);
    rememberAccessToken(conn.id, tokens.access_token, tokens.expires_in);
    return done("connected");
  } catch (err) {
    console.error("[Drive] OAuth callback failed:", err instanceof Error ? err.message : "unknown");
    return done("error");
  }
}

export async function disconnectDriveConnection(
  user: SessionUser,
  scope: "shared" | "personal"
) {
  if (scope === "shared" && user.role !== "ADMIN") {
    throw new AppError(
      "Chỉ quản trị viên được ngắt kết nối Google Drive dùng chung.",
      403,
      "FORBIDDEN"
    );
  }
  if (scope === "personal" && user.role !== "TEACHER" && user.role !== "ADMIN") {
    throw new AppError("Bạn không có quyền thao tác này.", 403, "FORBIDDEN");
  }

  const scopeKey = scope === "shared" ? SHARED_SCOPE_KEY : userScopeKey(user.id);
  const conn = await prisma.driveConnection.findUnique({ where: { scopeKey } });
  if (!conn || conn.status === "DISCONNECTED") {
    return { disconnected: true };
  }

  if (conn.encryptedRefreshToken) {
    try {
      await revokeToken(decryptSecret(conn.encryptedRefreshToken));
    } catch {
      // Proceed with local disconnection even if revocation fails
    }
  }

  // Keep email and rootFolderId so reconnecting the same account reuses its folder (PLAN 12.6)
  await prisma.$transaction([
    prisma.driveConnection.update({
      where: { id: conn.id },
      data: {
        status: "DISCONNECTED",
        encryptedRefreshToken: "",
      },
    }),
    prisma.driveUpload.updateMany({
      where: {
        connectionId: conn.id,
        status: { in: ["PENDING", "UPLOADING"] },
      },
      data: {
        status: "FAILED",
        encryptedSessionUri: null,
        errorMessage: "Kết nối Google Drive đã bị ngắt.",
      },
    }),
  ]);

  clearAccessTokenCache(conn.id);
  return { disconnected: true };
}

export async function updateDriveConnectionSettings(
  user: SessionUser,
  input: {
    scope: "shared" | "personal";
    allowPublicLessonVideos?: boolean;
    autoBackupEnabled?: boolean;
  }
) {
  if (input.scope === "shared") {
    if (user.role !== "ADMIN") {
      throw new AppError("Chỉ quản trị viên mới được đổi cài đặt này.", 403, "FORBIDDEN");
    }
    const conn = await prisma.driveConnection.findUnique({
      where: { scopeKey: SHARED_SCOPE_KEY },
    });
    if (!conn) {
      throw new AppError("Chưa kết nối Google Drive.", 409, "DRIVE_NOT_CONNECTED");
    }
    return prisma.driveConnection.update({
      where: { id: conn.id },
      data: {
        ...(input.allowPublicLessonVideos !== undefined
          ? { allowPublicLessonVideos: input.allowPublicLessonVideos }
          : {}),
      },
      select: { id: true, allowPublicLessonVideos: true, autoBackupEnabled: true },
    });
  }

  if (user.role !== "TEACHER" && user.role !== "ADMIN") {
    throw new AppError("Bạn không có quyền truy cập chức năng này.", 403, "FORBIDDEN");
  }
  const scopeKey = userScopeKey(user.id);
  const personal = await prisma.driveConnection.findUnique({ where: { scopeKey } });
  const shared = !personal
    ? await prisma.driveConnection.findUnique({ where: { scopeKey: SHARED_SCOPE_KEY } })
    : null;

  if (!personal && !shared) {
    throw new AppError("Chưa kết nối Google Drive.", 409, "DRIVE_NOT_CONNECTED");
  }
  if (!personal) {
    // Allow teacher to toggle auto-backup even when using school shared Drive by storing preference
    // only if they have a personal connection; otherwise reject cleanly if not connected personally.
    if (input.autoBackupEnabled !== undefined && shared?.status === "ACTIVE") {
      throw new AppError(
        "Vui lòng kết nối Google Drive cá nhân để bật tự động sao lưu hằng ngày.",
        409,
        "DRIVE_NOT_CONNECTED"
      );
    }
    throw new AppError("Chưa kết nối Google Drive.", 409, "DRIVE_NOT_CONNECTED");
  }

  return prisma.driveConnection.update({
    where: { id: personal.id },
    data: {
      ...(input.autoBackupEnabled !== undefined
        ? { autoBackupEnabled: input.autoBackupEnabled }
        : {}),
    },
    select: { id: true, allowPublicLessonVideos: true, autoBackupEnabled: true },
  });
}

// ---------------------------------------------------------------------------
// Backup Worksheets & Library to Drive (PLAN 12.5)
// ---------------------------------------------------------------------------
async function uploadFileIntoTeacherFolder(
  connectionId: string,
  input: {
    ownerId: string;
    teacherName: string;
    kind: DriveFileKind;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    storageKey: string;
    worksheetId?: string | null;
    classId?: string | null;
  }
) {
  const rootId = await ensureRootFolder(connectionId);
  const steps = buildDriveFolderSteps({
    kind: input.kind,
    teacherKey: input.ownerId,
    teacherName: input.teacherName,
    worksheetId: input.worksheetId,
    classId: input.classId,
  });

  let parentId = rootId;
  for (const step of steps) {
    parentId = await ensureFolderByKey(connectionId, step.key, step.name, parentId);
  }

  const remote = await uploadBufferToDrive(connectionId, {
    name: input.fileName,
    mimeType: input.mimeType,
    data: input.buffer,
    parentId,
    appProperties: {
      engclassKind: input.kind,
      engclassOwner: input.ownerId,
    },
  });

  const md5 = remote.md5Checksum ?? crypto.createHash("md5").update(input.buffer).digest("hex");

  const driveFile = await prisma.driveFile.create({
    data: {
      storageKey: input.storageKey,
      driveFileId: remote.id,
      connectionId,
      ownerId: input.ownerId,
      name: sanitizeDriveName(input.fileName, 160),
      mimeType: input.mimeType,
      size: input.buffer.byteLength,
      md5,
      kind: input.kind,
      worksheetId: input.worksheetId ?? null,
      classId: input.classId ?? null,
      shared: false,
    },
  });

  return { driveFile, remote };
}

export async function backupWorksheetToDrive(user: SessionUser, worksheetId: string) {
  const ws = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    select: { id: true, title: true, ownerId: true, owner: { select: { name: true } } },
  });
  if (!ws) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }
  if (user.role !== "ADMIN" && ws.ownerId !== user.id) {
    throw new AppError("Bạn không sở hữu phiếu bài tập này.", 403, "FORBIDDEN");
  }

  const connection = await resolveActiveDriveConnection(ws.ownerId);
  if (!connection) {
    throw new AppError("Chưa kết nối Google Drive.", 409, "DRIVE_NOT_CONNECTED");
  }

  const { buffer } = await exportWorksheetAsZip(ws.id);
  const safeBase = sanitizeDriveName(ws.title, 80);
  const fileName = `${safeBase}.engclass.zip`;
  const stamp = Date.now();
  const storageKey = `backups/${ws.ownerId}/${ws.id}/${stamp}.engclass.zip`;

  const { driveFile } = await uploadFileIntoTeacherFolder(connection.id, {
    ownerId: ws.ownerId,
    teacherName: ws.owner.name,
    kind: "BACKUP",
    fileName,
    mimeType: "application/zip",
    buffer,
    storageKey,
    worksheetId: ws.id,
  });

  const now = new Date();
  await prisma.worksheet.update({
    where: { id: ws.id },
    data: {
      lastDriveBackupAt: now,
      lastDriveBackupFileId: driveFile.driveFileId,
    },
  });

  return {
    worksheetId: ws.id,
    driveFileId: driveFile.driveFileId,
    fileName: driveFile.name,
    size: driveFile.size,
    backedUpAt: now.toISOString(),
  };
}

export async function backupAllWorksheetsToDrive(user: SessionUser) {
  if (user.role !== "TEACHER" && user.role !== "ADMIN") {
    throw new AppError("Bạn không có quyền truy cập chức năng này.", 403, "FORBIDDEN");
  }
  const connection = await resolveActiveDriveConnection(user.id);
  if (!connection) {
    throw new AppError("Chưa kết nối Google Drive.", 409, "DRIVE_NOT_CONNECTED");
  }

  const { buffer } = await exportAllTeacherWorksheetsZip(user.id);
  const count = await prisma.worksheet.count({ where: { ownerId: user.id } });
  const stamp = Date.now();
  const storageKey = `backups/${user.id}/library-${stamp}.zip`;

  const { driveFile } = await uploadFileIntoTeacherFolder(connection.id, {
    ownerId: user.id,
    teacherName: user.name,
    kind: "BACKUP",
    fileName: "thu-vien.zip",
    mimeType: "application/zip",
    buffer,
    storageKey,
  });

  const now = new Date();
  await prisma.worksheet.updateMany({
    where: { ownerId: user.id },
    data: { lastDriveBackupAt: now },
  });

  return {
    count,
    driveFileId: driveFile.driveFileId,
    fileName: driveFile.name,
    size: driveFile.size,
    backedUpAt: now.toISOString(),
  };
}

export async function runDailyAutoBackup(): Promise<{
  teachersChecked: number;
  worksheetsBackedUp: number;
  oldBackupsQueued: number;
  failed: number;
}> {
  const retention = Math.max(1, Number(process.env.DRIVE_BACKUP_RETENTION ?? 14));
  const connections = await prisma.driveConnection.findMany({
    where: {
      status: "ACTIVE",
      autoBackupEnabled: true,
      ownerId: { not: null },
    },
    include: { owner: { select: { id: true, email: true, name: true, role: true } } },
  });

  let worksheetsBackedUp = 0;
  let oldBackupsQueued = 0;
  let failed = 0;

  for (const conn of connections) {
    if (!conn.owner) continue;
    const owner = conn.owner;
    const worksheets = await prisma.worksheet.findMany({
      where: { ownerId: owner.id, deletedAt: null },
      select: { id: true, updatedAt: true, lastDriveBackupAt: true },
    });

    const changed = worksheets.filter(
      (ws) => !ws.lastDriveBackupAt || ws.updatedAt.getTime() > ws.lastDriveBackupAt.getTime()
    );

    for (const ws of changed) {
      try {
        await backupWorksheetToDrive(
          { id: owner.id, email: owner.email, name: owner.name, role: owner.role },
          ws.id
        );
        worksheetsBackedUp++;
      } catch (err) {
        failed++;
        console.error(
          `[Drive AutoBackup] Failed worksheet ${ws.id}:`,
          err instanceof Error ? err.message : "unknown"
        );
      }
    }

    // Enforce retention per worksheet (keep newest `retention` backups)
    const backups = await prisma.driveFile.findMany({
      where: {
        connectionId: conn.id,
        ownerId: owner.id,
        kind: "BACKUP",
        trashedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    const byGroup = new Map<string, typeof backups>();
    for (const b of backups) {
      const groupKey = b.worksheetId ?? "__library__";
      const list = byGroup.get(groupKey) ?? [];
      list.push(b);
      byGroup.set(groupKey, list);
    }

    for (const [, list] of byGroup) {
      const stale = list.slice(retention);
      if (stale.length > 0) {
        await enqueueDriveTrashByFileIds(
          stale.map((f) => f.id),
          "BACKUP_RETENTION"
        );
        oldBackupsQueued += stale.length;
      }
    }

    await prisma.driveConnection.update({
      where: { id: conn.id },
      data: { lastAutoBackupAt: new Date() },
    });
  }

  return {
    teachersChecked: connections.length,
    worksheetsBackedUp,
    oldBackupsQueued,
    failed,
  };
}

// ---------------------------------------------------------------------------
// Google Picker Token & Import From Drive (PLAN 12.5)
// ---------------------------------------------------------------------------
export async function getPickerTokenForUser(user: SessionUser) {
  if (user.role !== "TEACHER" && user.role !== "ADMIN") {
    throw new AppError("Bạn không có quyền truy cập chức năng này.", 403, "FORBIDDEN");
  }
  const connection = await resolveActiveDriveConnection(user.id);
  if (!connection) {
    throw new AppError("Chưa kết nối Google Drive.", 409, "DRIVE_NOT_CONNECTED");
  }
  const accessToken = await getAccessTokenForConnection(connection.id);
  return {
    accessToken,
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? "",
  };
}

export async function importWorksheetFromDrive(
  user: SessionUser,
  input: { driveFileId: string; fileName?: string; mimeType?: string }
) {
  if (user.role !== "TEACHER" && user.role !== "ADMIN") {
    throw new AppError("Bạn không có quyền truy cập chức năng này.", 403, "FORBIDDEN");
  }
  const connection = await resolveActiveDriveConnection(user.id);
  if (!connection) {
    throw new AppError("Chưa kết nối Google Drive.", 409, "DRIVE_NOT_CONNECTED");
  }

  const meta = await getDriveFileMetadata(connection.id, input.driveFileId);
  const fileName = input.fileName || meta.name || "imported-file";
  const mimeType = input.mimeType || meta.mimeType || "";
  const lower = fileName.toLowerCase();

  const { buffer } = await downloadDriveBuffer(connection.id, input.driveFileId);

  // Case 1: PDF -> Create a new worksheet and attach PDF
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
    const title = sanitizeDriveName(fileName.replace(/\.pdf$/i, ""), 120) || "Worksheet từ Drive";
    const ws = await createWorksheet(user.id, { title, instructions: null });
    await uploadWorksheetPdf(ws.id, buffer, "application/pdf");
    return {
      source: "pdf" as const,
      worksheets: [{ id: ws.id, title: ws.title }],
    };
  }

  // Case 2: Word (.docx) or plain text (.txt) -> parse fill-in-the-blank & create worksheet
  if (
    lower.endsWith(".docx") ||
    lower.endsWith(".txt") ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const { parsed } = await parseWordOrTextFile(buffer, fileName);

    if (parsed.fields.length === 0) {
      throw new AppError(
        "Không tìm thấy câu điền từ nào có dấu __đáp án__ trong file.",
        400,
        "NO_BLANKS_FOUND"
      );
    }

    const title =
      sanitizeDriveName(fileName.replace(/\.(docx|txt)$/i, ""), 120) || "Worksheet từ Word";
    const ws = await createWorksheet(user.id, { title, instructions: null });
    await saveWorksheetFields(
      ws.id,
      parsed.fields.map((f, idx) => ({
        placement: "ANSWER_SHEET",
        type: "TEXT",
        label: f.label,
        prompt: f.prompt,
        order: idx,
        points: f.points,
        answerKey: { accepted: f.accepted },
        gradingOpts: {
          caseSensitive: false,
          ignorePunctuation: true,
          ignoreExtraSpaces: true,
        },
      }))
    );

    return {
      source: "word" as const,
      worksheets: [{ id: ws.id, title: ws.title }],
    };
  }

  // Case 3: .engclass.zip / .zip / .json -> existing backup importer
  const imported = await importWorksheetFile(user.id, buffer, fileName);
  return {
    source: "backup" as const,
    worksheets: imported.worksheets.map((w) => ({ id: w.id, title: w.title })),
  };
}

// ---------------------------------------------------------------------------
// Option B Direct Browser Resumable Upload (Large Lesson Videos — PLAN 12.3)
// ---------------------------------------------------------------------------
const initUploadSchema = z.object({
  classId: z.string().min(1).max(120),
  lessonId: z.string().min(1).max(120).nullable().optional(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((v) => !/[\\/\u0000-\u001f]/.test(v), "Tên tệp không hợp lệ."),
  size: z.number().int().positive(),
  mimeType: z.string().trim().min(1).max(200),
  kind: z.enum(["video", "document"]).default("video"),
});

export async function initDirectDriveUpload(
  user: SessionUser,
  origin: string,
  raw: unknown
) {
  const input = initUploadSchema.parse(raw);
  const ext = path.extname(input.name).replace(/^\./, "").toLowerCase();
  const format = DIRECT_UPLOAD_FORMATS[ext];
  if (!format || format.mime !== input.mimeType || format.kind !== input.kind) {
    throw new AppError(
      "Định dạng file không được hỗ trợ.",
      400,
      "INVALID_MIME"
    );
  }
  const maxBytes = input.kind === "video" ? MAX_VIDEO_BYTES : MAX_DOC_BYTES;
  if (input.size > maxBytes) {
    throw new AppError("Kích thước file vượt quá giới hạn cho phép.", 413, "FILE_TOO_LARGE");
  }

  const cls = await prisma.class.findUnique({
    where: { id: input.classId },
    select: { id: true, name: true, teacherId: true, teacher: { select: { name: true } } },
  });
  if (!cls) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }
  if (user.role !== "ADMIN" && cls.teacherId !== user.id) {
    throw new AppError("Bạn không có quyền quản lý lớp học này.", 403, "FORBIDDEN");
  }

  if (input.lessonId) {
    // the lesson must be shown in this class and editable by the uploader (owner or admin)
    const lesson = await prisma.lesson.findFirst({
      where: {
        id: input.lessonId,
        classLinks: { some: { classId: cls.id } },
        ...(user.role === "ADMIN" ? {} : { ownerId: user.id }),
      },
      select: { id: true },
    });
    if (!lesson) {
      throw new AppError("Không tìm thấy chương bài giảng.", 404, "NOT_FOUND");
    }
  }

  const connection = await resolveActiveDriveConnection(cls.teacherId);
  if (!connection) {
    throw new AppError("Chưa kết nối Google Drive.", 409, "DRIVE_NOT_CONNECTED");
  }

  // Resume existing identical pending upload if found
  const cutoff = new Date(Date.now() - SESSION_LIFETIME_MS);
  const duplicate = await prisma.driveUpload.findFirst({
    where: {
      ownerId: user.id,
      classId: cls.id,
      name: input.name,
      size: input.size,
      mimeType: input.mimeType,
      status: { in: ["PENDING", "UPLOADING"] },
      encryptedSessionUri: { not: null },
      createdAt: { gt: cutoff },
    },
  });
  if (duplicate) {
    return resumeDirectDriveUpload(user, duplicate.id);
  }

  // Ensure destination folder exists
  const rootId = await ensureRootFolder(connection.id);
  const steps = buildDriveFolderSteps({
    kind: "LESSON_FILE",
    teacherKey: cls.teacherId,
    teacherName: cls.teacher.name,
    classId: cls.id,
    className: cls.name,
  });
  let parentId = rootId;
  for (const step of steps) {
    parentId = await ensureFolderByKey(connection.id, step.key, step.name, parentId);
  }

  const jobId = crypto.randomUUID();
  const sessionUri = await startResumableUpload(connection.id, {
    name: input.name,
    mimeType: input.mimeType,
    size: input.size,
    parentId,
    origin,
    appProperties: {
      engclassJobId: jobId,
      engclassKind: "LESSON_FILE",
    },
  });

  const job = await prisma.driveUpload.create({
    data: {
      id: jobId,
      connectionId: connection.id,
      ownerId: user.id,
      classId: cls.id,
      lessonId: input.lessonId ?? null,
      name: sanitizeDriveName(input.name, 160),
      mimeType: input.mimeType,
      size: input.size,
      kind: input.kind,
      status: "PENDING",
      bytesUploaded: 0,
      encryptedSessionUri: encryptSecret(sessionUri),
      shared: false,
    },
  });

  return {
    job: serializeDriveUpload(job),
    uploadUrl: sessionUri,
    offset: 0,
    chunkSize: DRIVE_CHUNK_SIZE,
    done: false,
  };
}

function serializeDriveUpload(job: {
  id: string;
  classId: string;
  lessonId: string | null;
  name: string;
  mimeType: string;
  size: number;
  kind: string;
  status: string;
  bytesUploaded: number;
  driveFileId: string | null;
  storageKey: string | null;
  shared: boolean;
  errorMessage: string | null;
  createdAt: Date;
}) {
  return {
    id: job.id,
    classId: job.classId,
    lessonId: job.lessonId,
    name: job.name,
    mimeType: job.mimeType,
    size: job.size,
    kind: job.kind,
    status: job.status,
    bytesUploaded: job.bytesUploaded,
    driveFileId: job.driveFileId,
    storageKey: job.storageKey,
    shared: job.shared,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    ...(job.driveFileId && job.shared && job.status === "COMPLETED"
      ? { previewUrl: drivePreviewUrl(job.driveFileId) }
      : {}),
  };
}

async function requireUploadJobAccess(user: SessionUser, jobId: string) {
  const job = await prisma.driveUpload.findUnique({
    where: { id: jobId },
    include: {
      class: { select: { teacherId: true } },
      connection: { select: { id: true, allowPublicLessonVideos: true } },
    },
  });
  if (!job) {
    throw new AppError("Không tìm thấy phiên tải lên.", 404, "NOT_FOUND");
  }
  if (user.role !== "ADMIN" && job.ownerId !== user.id && job.class.teacherId !== user.id) {
    throw new AppError("Bạn không có quyền truy cập phiên tải lên này.", 403, "FORBIDDEN");
  }
  return job;
}

export async function resumeDirectDriveUpload(user: SessionUser, jobId: string) {
  const job = await requireUploadJobAccess(user, jobId);
  if (job.status === "COMPLETED") {
    return { job: serializeDriveUpload(job), done: true };
  }
  if (job.status === "CANCELLED") {
    throw new AppError("Phiên tải lên đã bị huỷ.", 409, "UPLOAD_CANCELLED");
  }
  const stale = job.createdAt.getTime() < Date.now() - SESSION_LIFETIME_MS;
  if (!job.encryptedSessionUri || stale) {
    await prisma.driveUpload.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        encryptedSessionUri: null,
        errorMessage: "Phiên tải lên Google Drive đã hết hạn.",
      },
    });
    throw new AppError("Phiên tải lên Google Drive đã hết hạn.", 410, "DRIVE_SESSION_EXPIRED");
  }

  const sessionUri = decryptSecret(job.encryptedSessionUri);
  const state = await queryResumableUpload(sessionUri, job.size);
  if (state.state === "expired") {
    await prisma.driveUpload.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        encryptedSessionUri: null,
        errorMessage: "Phiên tải lên Google Drive đã hết hạn.",
      },
    });
    throw new AppError("Phiên tải lên Google Drive đã hết hạn.", 410, "DRIVE_SESSION_EXPIRED");
  }

  if (state.state === "done") {
    const completed = await finalizeDirectDriveUpload(job, state.file);
    return { job: serializeDriveUpload(completed), done: true };
  }

  const updated = await prisma.driveUpload.update({
    where: { id: job.id },
    data: {
      status: state.offset > 0 ? "UPLOADING" : "PENDING",
      bytesUploaded: state.offset,
      errorMessage: null,
    },
  });

  return {
    job: serializeDriveUpload(updated),
    uploadUrl: sessionUri,
    offset: state.offset,
    chunkSize: DRIVE_CHUNK_SIZE,
    done: false,
  };
}

async function finalizeDirectDriveUpload(
  job: Awaited<ReturnType<typeof requireUploadJobAccess>>,
  remote: DriveRemoteFile
) {
  if (job.status === "COMPLETED") return job;

  if (
    remote.appProperties?.engclassJobId !== job.id ||
    Number(remote.size) !== job.size ||
    remote.trashed
  ) {
    throw new AppError(
      "Tệp trên Google Drive không khớp với phiên tải lên này.",
      409,
      "DRIVE_FILE_MISMATCH"
    );
  }

  // Verify magic bytes via first 4 KiB range request (never pulls full video into server RAM)
  const head = await readDriveFileHead(job.connectionId, remote.id, 4096);
  if (!matchesMagicSignature(job.mimeType, head)) {
    await trashDriveFile(job.connectionId, remote.id).catch(() => undefined);
    await prisma.driveUpload.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        encryptedSessionUri: null,
        errorMessage: "Nội dung tệp không đúng định dạng đã khai báo.",
      },
    });
    throw new AppError(
      "Nội dung tệp không đúng định dạng đã khai báo.",
      400,
      "INVALID_MAGIC_BYTES"
    );
  }

  // Private by default; ONLY publish lesson video if admin explicitly toggled `allowPublicLessonVideos` (PLAN 12.3)
  let shared = false;
  if (job.kind === "video" && job.connection.allowPublicLessonVideos) {
    await ensurePublicReader(job.connectionId, remote.id);
    shared = true;
  }

  const ext = path.extname(job.name).toLowerCase() || ".bin";
  const storageKey = `lessons/${job.classId}/${job.lessonId ?? "library"}/${job.id}${ext}`;

  const [updatedJob] = await prisma.$transaction([
    prisma.driveUpload.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        driveFileId: remote.id,
        storageKey,
        bytesUploaded: job.size,
        shared,
        encryptedSessionUri: null,
        errorMessage: null,
      },
    }),
    prisma.driveFile.upsert({
      where: { storageKey },
      create: {
        storageKey,
        driveFileId: remote.id,
        connectionId: job.connectionId,
        ownerId: job.ownerId,
        name: job.name,
        mimeType: job.mimeType,
        size: job.size,
        md5: remote.md5Checksum ?? null,
        kind: "LESSON_FILE",
        classId: job.classId,
        shared,
      },
      update: {
        driveFileId: remote.id,
        shared,
        trashedAt: null,
      },
    }),
  ]);

  return updatedJob;
}

export async function completeDirectDriveUpload(
  user: SessionUser,
  jobId: string,
  raw: unknown
) {
  const { driveFileId } = z
    .object({
      driveFileId: z
        .string()
        .regex(/^[\w-]{6,140}$/)
        .optional(),
    })
    .parse(raw ?? {});

  const job = await requireUploadJobAccess(user, jobId);
  if (job.status === "COMPLETED") {
    return { job: serializeDriveUpload(job) };
  }
  if (job.status === "CANCELLED") {
    throw new AppError("Phiên tải lên đã bị huỷ.", 409, "UPLOAD_CANCELLED");
  }
  if (!driveFileId) {
    const res = await resumeDirectDriveUpload(user, jobId);
    if (!res.done) {
      throw new AppError("Tệp chưa tải lên đủ dung lượng.", 409, "DRIVE_UPLOAD_INCOMPLETE");
    }
    return { job: res.job };
  }

  const remote = await getDriveFileMetadata(job.connectionId, driveFileId);
  const completed = await finalizeDirectDriveUpload(job, remote);
  return { job: serializeDriveUpload(completed) };
}

export async function cancelDirectDriveUpload(user: SessionUser, jobId: string) {
  const job = await requireUploadJobAccess(user, jobId);
  if (job.status === "COMPLETED") {
    throw new AppError("Tệp đã tải lên hoàn tất.", 409, "ALREADY_COMPLETED");
  }
  if (job.encryptedSessionUri) {
    await cancelResumableUpload(decryptSecret(job.encryptedSessionUri)).catch(() => undefined);
  }
  const updated = await prisma.driveUpload.update({
    where: { id: job.id },
    data: { status: "CANCELLED", encryptedSessionUri: null },
  });
  return { job: serializeDriveUpload(updated) };
}

// ---------------------------------------------------------------------------
// File Access Control & Streaming (/api/drive/files, /api/drive/files/[id]/view)
// ---------------------------------------------------------------------------
export async function authorizeDriveFileAccess(
  user: SessionUser,
  file: {
    id: string;
    storageKey: string;
    ownerId: string | null;
    kind: DriveFileKind;
    worksheetId: string | null;
    classId: string | null;
    submissionId: string | null;
  }
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (file.ownerId && file.ownerId === user.id) return true;

  // Backups & Word sources are strictly owner/admin only
  if (file.kind === "BACKUP" || file.kind === "WORD_SOURCE") {
    return false;
  }

  // Worksheet audio is never downloadable directly by students (must use play-limited stream)
  if (file.kind === "WORKSHEET_AUDIO") {
    if (user.role === "TEACHER" && file.worksheetId) {
      const ws = await prisma.worksheet.findUnique({
        where: { id: file.worksheetId },
        select: { ownerId: true },
      });
      return ws?.ownerId === user.id;
    }
    return false;
  }

  // Submission files (proctor snapshots, future voice/image answers)
  if (file.kind === "SUBMISSION_FILE" && file.submissionId) {
    const sub = await prisma.submission.findUnique({
      where: { id: file.submissionId },
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
    if (user.role === "TEACHER") return sub.assignment.class.teacherId === user.id;
    if (user.role === "STUDENT") return sub.studentId === user.id;
    if (user.role === "PARENT") {
      if (file.storageKey.startsWith("proctor/") && !sub.assignment.shareProctorWithParent) {
        return false;
      }
      const link = await prisma.parentLink.findUnique({
        where: { parentId_studentId: { parentId: user.id, studentId: sub.studentId } },
      });
      return Boolean(link?.verifiedAt);
    }
    return false;
  }

  // Lesson files: class teacher, enrolled active student, or verified parent of enrolled student
  if (file.kind === "LESSON_FILE" && file.classId) {
    if (user.role === "TEACHER") {
      const cls = await prisma.class.findUnique({
        where: { id: file.classId },
        select: { teacherId: true },
      });
      return cls?.teacherId === user.id;
    }
    if (user.role === "STUDENT") {
      const enr = await prisma.enrollment.findUnique({
        where: { classId_studentId: { classId: file.classId, studentId: user.id } },
      });
      return enr?.status === "ACTIVE";
    }
    if (user.role === "PARENT") {
      const enr = await prisma.enrollment.findFirst({
        where: {
          classId: file.classId,
          status: "ACTIVE",
          student: {
            parentLinksAsChild: { some: { parentId: user.id, verifiedAt: { not: null } } },
          },
        },
        select: { id: true },
      });
      return Boolean(enr);
    }
    return false;
  }

  // Fallback to existing storageKey authorization (handles WORKSHEET_PDF & legacy paths)
  return authorizeFileDownload(user.id, user.role, file.storageKey);
}

export async function streamDriveFileForUser(
  user: SessionUser,
  fileIdOrKey: string,
  rangeHeader: string | null,
  inline: boolean
): Promise<Response> {
  const file = await prisma.driveFile.findFirst({
    where: {
      trashedAt: null,
      OR: [{ id: fileIdOrKey }, { driveFileId: fileIdOrKey }],
    },
  });
  if (!file) {
    throw new AppError("Không tìm thấy tệp.", 404, "NOT_FOUND");
  }

  const allowed = await authorizeDriveFileAccess(user, file);
  if (!allowed) {
    throw new AppError("Bạn không có quyền tải tệp này.", 403, "FORBIDDEN");
  }

  const upstream = await downloadDriveStream(file.connectionId, file.driveFileId, rangeHeader);
  const canInline = inline && /^(video\/|audio\/|image\/|application\/pdf$)/.test(file.mimeType);
  const headers: Record<string, string> = {
    "Content-Type": file.mimeType,
    "Content-Disposition": `${canInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(
      file.name
    )}`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers["Content-Length"] = contentLength;
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers["Content-Range"] = contentRange;
  if (canInline && !file.mimeType.startsWith("application/")) {
    headers["Content-Security-Policy"] =
      "sandbox; default-src 'none'; media-src 'self'; img-src 'self'";
  }

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  });
}

export async function listDriveFilesForUser(
  user: SessionUser,
  options?: { kind?: DriveFileKind; query?: string; remote?: boolean }
) {
  if (user.role !== "TEACHER" && user.role !== "ADMIN") {
    throw new AppError("Bạn không có quyền truy cập chức năng này.", 403, "FORBIDDEN");
  }

  if (options?.remote) {
    const conn = await resolveActiveDriveConnection(user.id);
    if (!conn) {
      throw new AppError("Chưa kết nối Google Drive.", 409, "DRIVE_NOT_CONNECTED");
    }
    const files = await listDriveFolderFiles(conn.id, conn.rootFolderId ?? undefined, options.query);
    return {
      files: files.map((f) => ({
        id: f.id,
        driveFileId: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? Number(f.size) : 0,
        createdAt: f.createdTime ?? null,
      })),
    };
  }

  const rows = await prisma.driveFile.findMany({
    where: {
      trashedAt: null,
      ...(user.role === "ADMIN" ? {} : { ownerId: user.id }),
      ...(options?.kind ? { kind: options.kind } : {}),
      ...(options?.query?.trim()
        ? { name: { contains: options.query.trim(), mode: "insensitive" } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      driveFileId: true,
      storageKey: true,
      name: true,
      mimeType: true,
      size: true,
      kind: true,
      worksheetId: true,
      classId: true,
      shared: true,
      createdAt: true,
    },
  });

  return {
    files: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Deletion Queue (DriveTrash) & Prune Maintenance (PLAN 12.6)
// ---------------------------------------------------------------------------
export async function enqueueDriveTrashForKeys(
  storageKeys: string[],
  reason = "ENTITY_DELETED"
): Promise<number> {
  const uniqueKeys = Array.from(new Set(storageKeys.filter(Boolean)));
  if (uniqueKeys.length === 0) return 0;

  const files = await prisma.driveFile.findMany({
    where: { storageKey: { in: uniqueKeys }, trashedAt: null },
    select: { id: true, driveFileId: true, connectionId: true, storageKey: true },
  });
  if (files.length === 0) return 0;

  const now = new Date();
  await prisma.$transaction([
    prisma.driveFile.updateMany({
      where: { id: { in: files.map((f) => f.id) } },
      data: { trashedAt: now },
    }),
    prisma.driveTrash.createMany({
      data: files.map((f) => ({
        driveFileId: f.driveFileId,
        connectionId: f.connectionId,
        storageKey: f.storageKey,
        reason,
      })),
    }),
  ]);

  return files.length;
}

export async function enqueueDriveTrashByFileIds(
  driveFileDbIds: string[],
  reason = "PRUNED"
): Promise<number> {
  if (driveFileDbIds.length === 0) return 0;
  const files = await prisma.driveFile.findMany({
    where: { id: { in: driveFileDbIds }, trashedAt: null },
    select: { id: true, driveFileId: true, connectionId: true, storageKey: true },
  });
  if (files.length === 0) return 0;

  const now = new Date();
  await prisma.$transaction([
    prisma.driveFile.updateMany({
      where: { id: { in: files.map((f) => f.id) } },
      data: { trashedAt: now },
    }),
    prisma.driveTrash.createMany({
      data: files.map((f) => ({
        driveFileId: f.driveFileId,
        connectionId: f.connectionId,
        storageKey: f.storageKey,
        reason,
      })),
    }),
  ]);

  return files.length;
}

export interface DrivePruneResult {
  trashedOnDrive: number;
  removedRecords: number;
  failed: number;
  skippedNoConnection: boolean;
  unshared: number;
}

export async function pruneDrive(graceHours = 24, at = Date.now()): Promise<DrivePruneResult> {
  const result: DrivePruneResult = {
    trashedOnDrive: 0,
    removedRecords: 0,
    failed: 0,
    skippedNoConnection: false,
    unshared: 0,
  };

  const activeConnections = await prisma.driveConnection.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, allowPublicLessonVideos: true },
  });
  const activeMap = new Map(activeConnections.map((c) => [c.id, c]));

  // 1. Revoke accidental public sharing on any non-lesson-video files (or all if admin disabled public videos)
  const exposedFiles = await prisma.driveFile.findMany({
    where: { shared: true, trashedAt: null },
    select: { id: true, driveFileId: true, connectionId: true, kind: true, mimeType: true },
  });
  for (const f of exposedFiles) {
    const conn = activeMap.get(f.connectionId);
    const allowedPublic =
      f.kind === "LESSON_FILE" && f.mimeType.startsWith("video/") && conn?.allowPublicLessonVideos;
    if (allowedPublic) continue;
    if (!conn) {
      result.skippedNoConnection = true;
      continue;
    }
    try {
      await revokePublicReader(f.connectionId, f.driveFileId);
      await prisma.driveFile.update({ where: { id: f.id }, data: { shared: false } });
      result.unshared++;
    } catch (err) {
      result.failed++;
      console.error("[Drive Prune] Unshare failed:", err instanceof Error ? err.message : "unknown");
    }
  }

  // 2. Process queued DriveTrash records (move to Drive trash with trashed=true)
  const trashRows = await prisma.driveTrash.findMany({
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const fallbackShared = await prisma.driveConnection.findUnique({
    where: { scopeKey: SHARED_SCOPE_KEY },
    select: { id: true, status: true },
  });

  for (const row of trashRows) {
    const connId =
      (row.connectionId && activeMap.has(row.connectionId) ? row.connectionId : null) ??
      (fallbackShared?.status === "ACTIVE" ? fallbackShared.id : null);

    if (!connId) {
      result.skippedNoConnection = true;
      continue;
    }
    try {
      await trashDriveFile(connId, row.driveFileId);
      await prisma.driveTrash.delete({ where: { id: row.id } });
      result.trashedOnDrive++;
      result.removedRecords++;
    } catch (err) {
      result.failed++;
      console.error(
        `[Drive Prune] Trash failed for ${row.driveFileId}:`,
        err instanceof Error ? err.message : "unknown"
      );
    }
  }

  // 3. Clean up expired/abandoned DriveUpload records
  const graceCutoff = new Date(at - graceHours * 3600 * 1000);
  const sessionCutoff = new Date(at - SESSION_LIFETIME_MS);
  const staleUploads = await prisma.driveUpload.deleteMany({
    where: {
      OR: [
        { status: { in: ["FAILED", "CANCELLED"] }, createdAt: { lt: graceCutoff } },
        { status: { in: ["PENDING", "UPLOADING"] }, createdAt: { lt: sessionCutoff } },
      ],
    },
  });
  result.removedRecords += staleUploads.count;

  // 4. Remove old already-trashed DriveFile tombstones older than graceHours
  const staleTombstones = await prisma.driveFile.deleteMany({
    where: {
      trashedAt: { not: null, lt: graceCutoff },
    },
  });
  result.removedRecords += staleTombstones.count;

  return result;
}

// ---------------------------------------------------------------------------
// Storage Location Indicator for WorksheetEditor (PLAN 12.5)
// ---------------------------------------------------------------------------
export async function getStorageLocationsForKeys(
  keys: string[]
): Promise<Record<string, "drive" | "s3" | "local">> {
  const unique = Array.from(new Set(keys.filter(Boolean)));
  const result: Record<string, "drive" | "s3" | "local"> = {};
  if (unique.length === 0) return result;

  const fallbackDriver = getActiveStorageDriver() === "s3" ? "s3" : "local";
  const driveFiles = await prisma.driveFile.findMany({
    where: { storageKey: { in: unique }, trashedAt: null },
    select: { storageKey: true },
  });
  const driveSet = new Set(driveFiles.map((f) => f.storageKey));

  for (const key of unique) {
    result[key] = driveSet.has(key) ? "drive" : fallbackDriver;
  }
  return result;
}

export { placeDriveFile };
