import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

/**
 * Thin REST client for Google OAuth 2.0 (web server + PKCE) and Google Drive API v3.
 * Uses native fetch only — no SDK dependencies. Tokens and session URIs are never logged.
 */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const SHARED_SCOPE_KEY = "shared";
export const ROOT_FOLDER_NAME = "Pivora";

/** Resumable chunk size (8 MiB — must be a multiple of 256 KiB per Google Drive spec). */
export const DRIVE_CHUNK_SIZE = 32 * 256 * 1024;
/** Threshold between multipart upload and server-side resumable upload (5 MiB). */
export const DRIVE_MULTIPART_MAX_BYTES = 5 * 1024 * 1024;

const FILE_FIELDS = "id,name,mimeType,size,md5Checksum,webViewLink,trashed,appProperties,parents,createdTime";

export function userScopeKey(userId: string): string {
  return `user:${userId}`;
}

function allowMockEndpoints(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DRIVE_MOCK_BASE === "true";
}

function getAuthUrl(): string {
  if (allowMockEndpoints() && process.env.GOOGLE_OAUTH_AUTH_URL) {
    return process.env.GOOGLE_OAUTH_AUTH_URL;
  }
  return "https://accounts.google.com/o/oauth2/v2/auth";
}

function getTokenUrl(): string {
  if (allowMockEndpoints() && process.env.GOOGLE_OAUTH_TOKEN_URL) {
    return process.env.GOOGLE_OAUTH_TOKEN_URL;
  }
  return "https://oauth2.googleapis.com/token";
}

function getRevokeUrl(): string {
  if (allowMockEndpoints() && process.env.GOOGLE_OAUTH_REVOKE_URL) {
    return process.env.GOOGLE_OAUTH_REVOKE_URL;
  }
  return "https://oauth2.googleapis.com/revoke";
}

function getDriveApiBase(): string {
  if (allowMockEndpoints() && process.env.GOOGLE_DRIVE_API_BASE) {
    return process.env.GOOGLE_DRIVE_API_BASE.replace(/\/+$/, "");
  }
  return "https://www.googleapis.com/drive/v3";
}

function getDriveUploadBase(): string {
  if (allowMockEndpoints() && process.env.GOOGLE_DRIVE_UPLOAD_BASE) {
    return process.env.GOOGLE_DRIVE_UPLOAD_BASE.replace(/\/+$/, "");
  }
  return "https://www.googleapis.com/upload/drive/v3";
}

function getEncryptionSecret(): string {
  const value = process.env.DRIVE_ENCRYPTION_KEY?.trim() ?? "";
  return value.length >= 32 ? value : "";
}

export function isDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      getEncryptionSecret()
  );
}

function requireOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !getEncryptionSecret()) {
    throw new AppError(
      "Google Drive chưa được cấu hình. Quản trị viên cần đặt GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET và DRIVE_ENCRYPTION_KEY.",
      503,
      "DRIVE_NOT_CONFIGURED"
    );
  }
  return { clientId, clientSecret };
}

export function appOrigin(request?: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    return new URL(configured).origin;
  }
  if (request) {
    return new URL(request.url).origin;
  }
  return "http://localhost:3000";
}

export function driveRedirectUri(request?: Request): string {
  const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return `${appOrigin(request)}/api/drive/callback`;
}

/**
 * Verifies Origin header on state-changing Drive requests (POST / PATCH / DELETE) to block CSRF.
 */
export function assertDriveOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Same-origin non-browser server requests or tests without Origin header may include Sec-Fetch-Site.
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      throw new AppError("Yêu cầu không hợp lệ (sai nguồn Origin).", 403, "INVALID_ORIGIN");
    }
    return;
  }
  const allowed = new Set<string>([appOrigin(request)]);
  try {
    allowed.add(new URL(request.url).origin);
  } catch {
    // ignore malformed URL
  }
  if (!allowed.has(origin)) {
    throw new AppError("Yêu cầu không hợp lệ (sai nguồn Origin).", 403, "INVALID_ORIGIN");
  }
}

// ---------------------------------------------------------------------------
// AES-256-GCM encryption for refresh tokens & resumable upload session URIs
// ---------------------------------------------------------------------------
function deriveAesKey(): Buffer {
  const secret = getEncryptionSecret();
  if (!secret) {
    throw new AppError(
      "Chưa cấu hình DRIVE_ENCRYPTION_KEY (tối thiểu 32 ký tự).",
      503,
      "DRIVE_NOT_CONFIGURED"
    );
  }
  return createHash("sha256").update(`engclass-drive-v1:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveAesKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(envelope: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new AppError("Dữ liệu mã hoá Drive không hợp lệ.", 500, "DRIVE_DECRYPT_ERROR");
  }
  const [, ivB64, tagB64, bodyB64] = parts;
  if (!ivB64 || !tagB64 || !bodyB64) {
    throw new AppError("Dữ liệu mã hoá Drive không hợp lệ.", 500, "DRIVE_DECRYPT_ERROR");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveAesKey(),
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(bodyB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError(
      "Không giải mã được kết nối Google Drive. Có thể khoá DRIVE_ENCRYPTION_KEY đã thay đổi; hãy kết nối lại.",
      500,
      "DRIVE_DECRYPT_ERROR"
    );
  }
}

// ---------------------------------------------------------------------------
// OAuth 2.0 + PKCE (S256)
// ---------------------------------------------------------------------------
export function newOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function statesMatch(expected: string | undefined, actual: string | null): boolean {
  if (!expected || !actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newPkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthorizationUrl(
  request: Request,
  state: string,
  codeChallenge: string
): string {
  const { clientId } = requireOAuthConfig();
  const url = new URL(getAuthUrl());
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: driveRedirectUri(request),
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

async function tokenRequest(params: Record<string, string>) {
  const { clientId, clientSecret } = requireOAuthConfig();
  const res = await fetch(getTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      ...params,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { res, data };
}

export async function exchangeAuthorizationCode(
  request: Request,
  code: string,
  codeVerifier: string
) {
  const { res, data } = await tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: driveRedirectUri(request),
  });
  if (!res.ok) {
    console.error("[Drive] Token exchange failed:", res.status, data.error ?? "unknown");
    throw new AppError(
      "Google từ chối mã xác thực OAuth. Vui lòng thử kết nối lại.",
      400,
      "DRIVE_OAUTH_FAILED"
    );
  }
  return tokenResponseSchema.parse(data);
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(getRevokeUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

// Per-connection access token cache (never stored in DB or logged)
const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

export function clearAccessTokenCache(connectionId?: string): void {
  if (connectionId) {
    accessTokenCache.delete(connectionId);
  } else {
    accessTokenCache.clear();
  }
}

export function rememberAccessToken(
  connectionId: string,
  token: string,
  expiresInSec: number
): void {
  accessTokenCache.set(connectionId, {
    token,
    expiresAt: Date.now() + Math.max(10, expiresInSec - 60) * 1000,
  });
}

export async function getAccessTokenForConnection(connectionId: string): Promise<string> {
  const cached = accessTokenCache.get(connectionId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const connection = await prisma.driveConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection) {
    throw new AppError("Chưa kết nối Google Drive.", 409, "DRIVE_NOT_CONNECTED");
  }
  if (connection.status === "DISCONNECTED") {
    throw new AppError(
      "Google Drive đã bị ngắt kết nối. Vui lòng kết nối lại.",
      409,
      "DRIVE_DISCONNECTED"
    );
  }
  if (connection.status === "REVOKED" || !connection.encryptedRefreshToken) {
    throw new AppError(
      "Kết nối Google Drive đã bị thu hồi hoặc hết hiệu lực. Vui lòng kết nối lại.",
      409,
      "DRIVE_REVOKED"
    );
  }

  const refreshToken = decryptSecret(connection.encryptedRefreshToken);
  const { res, data } = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  if (!res.ok) {
    if (data.error === "invalid_grant") {
      clearAccessTokenCache(connectionId);
      await prisma.driveConnection
        .update({
          where: { id: connectionId },
          data: { status: "REVOKED" },
        })
        .catch(() => undefined);
      throw new AppError(
        "Kết nối Google Drive đã bị thu hồi hoặc hết hiệu lực. Vui lòng kết nối lại.",
        409,
        "DRIVE_REVOKED"
      );
    }
    console.error("[Drive] Token refresh failed:", res.status, data.error ?? "unknown");
    throw new AppError(
      "Không làm mới được phiên Google Drive. Vui lòng thử lại.",
      res.status >= 500 ? 503 : 502,
      "DRIVE_REFRESH_FAILED"
    );
  }

  const parsed = tokenResponseSchema.parse(data);
  rememberAccessToken(connectionId, parsed.access_token, parsed.expires_in);
  return parsed.access_token;
}

// ---------------------------------------------------------------------------
// Error classification & authenticated Drive HTTP calls with backoff retry
// ---------------------------------------------------------------------------
let backoffBaseMs = 400;
export function setDriveBackoffBaseMsForTests(ms: number): void {
  backoffBaseMs = ms;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function classifyGoogleError(res: Response): Promise<AppError> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; errors?: Array<{ reason?: string }> };
  };
  const reason = body.error?.errors?.[0]?.reason ?? "";
  console.error("[Drive] API error:", res.status, reason || "unknown");

  if (reason === "storageQuotaExceeded") {
    return new AppError(
      "Google Drive đã đầy. Hãy giải phóng dung lượng rồi thử lại.",
      507,
      "DRIVE_QUOTA_EXCEEDED"
    );
  }

  if (
    res.status === 429 ||
    (res.status === 403 && /rateLimit|userRateLimit|quota/i.test(reason) && !/storage/i.test(reason))
  ) {
    return new AppError(
      "Google Drive đang giới hạn tần suất. Vui lòng thử lại sau ít phút.",
      429,
      "DRIVE_RATE_LIMITED"
    );
  }

  switch (res.status) {
    case 400:
      return new AppError("Google Drive từ chối yêu cầu không hợp lệ.", 400, "DRIVE_BAD_REQUEST");
    case 401:
      return new AppError(
        "Phiên Google Drive không hợp lệ. Vui lòng kết nối lại.",
        502,
        "DRIVE_AUTH_ERROR"
      );
    case 403:
      return new AppError("Google Drive từ chối quyền truy cập.", 502, "DRIVE_FORBIDDEN");
    case 404:
      return new AppError("Không tìm thấy tệp trên Google Drive.", 404, "DRIVE_NOT_FOUND");
    default:
      return new AppError(
        "Google Drive tạm thời không phản hồi. Vui lòng thử lại.",
        res.status >= 500 ? 503 : 502,
        "DRIVE_UNAVAILABLE"
      );
  }
}

async function isRateLimit403(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const clone = res.clone();
  const body = (await clone.json().catch(() => ({}))) as {
    error?: { errors?: Array<{ reason?: string }> };
  };
  const reason = body.error?.errors?.[0]?.reason ?? "";
  return /rateLimit|userRateLimit/i.test(reason);
}

export async function driveFetch(
  connectionId: string,
  url: string,
  init: RequestInit = {},
  options?: { retryNonIdempotent?: boolean; maxRetries?: number }
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const canRetry =
    options?.retryNonIdempotent || ["GET", "DELETE", "PATCH", "PUT"].includes(method);
  const maxRetries = options?.maxRetries ?? 3;
  let refreshed = false;

  for (let attempt = 0; ; attempt++) {
    const token = await getAccessTokenForConnection(connectionId);
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    };
    const res = await fetch(url, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });

    if (res.status === 401 && !refreshed) {
      refreshed = true;
      clearAccessTokenCache(connectionId);
      continue;
    }

    const rateLimited = res.status === 429 || (await isRateLimit403(res));
    if ((rateLimited || res.status >= 500) && canRetry && attempt < maxRetries) {
      await sleep(backoffBaseMs * 2 ** attempt);
      continue;
    }

    return res;
  }
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw await classifyGoogleError(res);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Drive About / Account Info & Quota
// ---------------------------------------------------------------------------
export interface DriveAboutInfo {
  email: string;
  usageBytes: number | null;
  usageInDriveBytes: number | null;
  limitBytes: number | null;
}

export async function getDriveAboutWithToken(accessToken: string): Promise<DriveAboutInfo> {
  const res = await fetch(
    `${getDriveApiBase()}/about?fields=user(emailAddress),storageQuota(limit,usage,usageInDrive)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    }
  );
  const data = await parseJsonOrThrow<{
    user?: { emailAddress?: string };
    storageQuota?: { limit?: string; usage?: string; usageInDrive?: string };
  }>(res);
  return {
    email: data.user?.emailAddress ?? "unknown",
    usageBytes: data.storageQuota?.usage ? Number(data.storageQuota.usage) : null,
    usageInDriveBytes: data.storageQuota?.usageInDrive
      ? Number(data.storageQuota.usageInDrive)
      : null,
    limitBytes: data.storageQuota?.limit ? Number(data.storageQuota.limit) : null,
  };
}

export async function getDriveAbout(connectionId: string): Promise<DriveAboutInfo> {
  const res = await driveFetch(
    connectionId,
    `${getDriveApiBase()}/about?fields=user(emailAddress),storageQuota(limit,usage,usageInDrive)`
  );
  const data = await parseJsonOrThrow<{
    user?: { emailAddress?: string };
    storageQuota?: { limit?: string; usage?: string; usageInDrive?: string };
  }>(res);
  return {
    email: data.user?.emailAddress ?? "unknown",
    usageBytes: data.storageQuota?.usage ? Number(data.storageQuota.usage) : null,
    usageInDriveBytes: data.storageQuota?.usageInDrive
      ? Number(data.storageQuota.usageInDrive)
      : null,
    limitBytes: data.storageQuota?.limit ? Number(data.storageQuota.limit) : null,
  };
}

// ---------------------------------------------------------------------------
// Naming & Folder Hierarchy (PLAN 12.4)
// ---------------------------------------------------------------------------
export function sanitizeDriveName(value: string, maxLength = 100): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim();
  if (!cleaned) return "Untitled";
  if (cleaned.length <= maxLength) return cleaned;
  const extMatch = /\.[A-Za-z0-9]{1,12}$/.exec(cleaned);
  if (extMatch && extMatch[0].length < maxLength - 4) {
    return cleaned.slice(0, maxLength - extMatch[0].length).trimEnd() + extMatch[0];
  }
  return cleaned.slice(0, maxLength).trimEnd();
}

const escapeDriveQuery = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export interface DriveRemoteFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  md5Checksum?: string;
  webViewLink?: string;
  trashed?: boolean;
  appProperties?: Record<string, string>;
  parents?: string[];
  createdTime?: string;
}

export async function createDriveFolder(
  connectionId: string,
  name: string,
  parentId?: string,
  appProperties?: Record<string, string>
): Promise<string> {
  const res = await driveFetch(
    connectionId,
    `${getDriveApiBase()}/files?fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        name: sanitizeDriveName(name, 120),
        mimeType: "application/vnd.google-apps.folder",
        ...(parentId ? { parents: [parentId] } : {}),
        ...(appProperties ? { appProperties } : {}),
      }),
    },
    { retryNonIdempotent: true }
  );
  return (await parseJsonOrThrow<{ id: string }>(res)).id;
}

export async function placeDriveFile(
  connectionId: string,
  fileId: string,
  change: { name?: string; parentId?: string }
): Promise<void> {
  const id = encodeURIComponent(fileId);
  const params = new URLSearchParams({ fields: "id" });
  if (change.parentId) {
    const currentRes = await driveFetch(
      connectionId,
      `${getDriveApiBase()}/files/${id}?fields=parents`
    );
    const current = await parseJsonOrThrow<{ parents?: string[] }>(currentRes);
    if (!current.parents?.includes(change.parentId)) {
      params.set("addParents", change.parentId);
      if (current.parents?.length) {
        params.set("removeParents", current.parents.join(","));
      }
    }
  }
  const patchRes = await driveFetch(connectionId, `${getDriveApiBase()}/files/${id}?${params}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(change.name ? { name: sanitizeDriveName(change.name, 160) } : {}),
  });
  await parseJsonOrThrow<{ id: string }>(patchRes);
}

const folderLocks = new Map<string, Promise<string>>();

/**
 * Ensures a folder identified by a stable `engclassFolder` appProperty exists under `parentId`.
 * If the folder already exists with an outdated name (e.g. teacher renamed a worksheet or class),
 * it renames the existing folder in place rather than creating duplicates.
 */
export function ensureFolderByKey(
  connectionId: string,
  key: string,
  name: string,
  parentId: string
): Promise<string> {
  const lockKey = `${connectionId}|${parentId}|${key}`;
  const inFlight = folderLocks.get(lockKey);
  if (inFlight) return inFlight;

  const safeFolderName = sanitizeDriveName(name, 100);
  const task = (async () => {
    const params = new URLSearchParams({
      q: `appProperties has { key='engclassFolder' and value='${escapeDriveQuery(
        key
      )}' } and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id,name,parents)",
      pageSize: "5",
    });
    const listRes = await driveFetch(connectionId, `${getDriveApiBase()}/files?${params}`);
    const list = await parseJsonOrThrow<{
      files: Array<{ id: string; name: string; parents?: string[] }>;
    }>(listRes);
    const found = list.files?.[0];
    if (found) {
      if (found.name !== safeFolderName || !found.parents?.includes(parentId)) {
        await placeDriveFile(connectionId, found.id, {
          name: safeFolderName,
          parentId,
        });
      }
      return found.id;
    }
    return createDriveFolder(connectionId, safeFolderName, parentId, {
      engclassFolder: key,
    });
  })().finally(() => {
    folderLocks.delete(lockKey);
  });

  folderLocks.set(lockKey, task);
  return task;
}

export async function ensureRootFolder(
  connectionId: string,
  forceRecreate = false
): Promise<string> {
  const conn = await prisma.driveConnection.findUnique({
    where: { id: connectionId },
    select: { rootFolderId: true },
  });
  if (conn?.rootFolderId && !forceRecreate) {
    return conn.rootFolderId;
  }

  // Try finding an existing app root folder (named "EngClass" before the Pivora rename) first so reconnecting doesn't duplicate
  if (!forceRecreate) {
    const params = new URLSearchParams({
      q: `appProperties has { key='engclassRoot' and value='1' } and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
      pageSize: "1",
    });
    const foundRes = await driveFetch(connectionId, `${getDriveApiBase()}/files?${params}`);
    if (foundRes.ok) {
      const found = (await foundRes.json()) as { files?: Array<{ id: string }> };
      if (found.files?.[0]?.id) {
        const existingId = found.files[0].id;
        await prisma.driveConnection.update({
          where: { id: connectionId },
          data: { rootFolderId: existingId },
        });
        return existingId;
      }
    }
  }

  const createdId = await createDriveFolder(connectionId, ROOT_FOLDER_NAME, undefined, {
    engclassRoot: "1",
  });
  await prisma.driveConnection.update({
    where: { id: connectionId },
    data: { rootFolderId: createdId },
  });
  return createdId;
}

// ---------------------------------------------------------------------------
// Server-side Uploads: Multipart (<= 5 MiB) & Resumable (> 5 MiB)
// ---------------------------------------------------------------------------
export async function uploadMultipartToDrive(
  connectionId: string,
  input: {
    name: string;
    mimeType: string;
    data: Buffer;
    parentId?: string;
    appProperties?: Record<string, string>;
  }
): Promise<DriveRemoteFile> {
  const boundary = `engclass_${randomBytes(12).toString("hex")}`;
  const metadata = JSON.stringify({
    name: sanitizeDriveName(input.name, 160),
    mimeType: input.mimeType,
    ...(input.parentId ? { parents: [input.parentId] } : {}),
    ...(input.appProperties ? { appProperties: input.appProperties } : {}),
  });

  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
    "utf8"
  );
  const tail = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const body = Buffer.concat([head, input.data, tail]);

  const params = new URLSearchParams({ uploadType: "multipart", fields: FILE_FIELDS });
  const res = await driveFetch(
    connectionId,
    `${getDriveUploadBase()}/files?${params}`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.byteLength),
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(60_000),
    },
    { retryNonIdempotent: true }
  );

  return parseJsonOrThrow<DriveRemoteFile>(res);
}

export async function startResumableUpload(
  connectionId: string,
  input: {
    name: string;
    mimeType: string;
    size: number;
    parentId?: string;
    appProperties?: Record<string, string>;
    origin?: string;
  }
): Promise<string> {
  const params = new URLSearchParams({ uploadType: "resumable", fields: FILE_FIELDS });
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": input.mimeType,
    "X-Upload-Content-Length": String(input.size),
  };
  if (input.origin) {
    headers.Origin = input.origin;
  }

  const res = await driveFetch(
    connectionId,
    `${getDriveUploadBase()}/files?${params}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: sanitizeDriveName(input.name, 160),
        mimeType: input.mimeType,
        ...(input.parentId ? { parents: [input.parentId] } : {}),
        ...(input.appProperties ? { appProperties: input.appProperties } : {}),
      }),
    },
    { retryNonIdempotent: true }
  );

  if (!res.ok) throw await classifyGoogleError(res);
  const location = res.headers.get("location");
  if (!location || (!location.startsWith("https://") && !allowMockEndpoints())) {
    throw new AppError(
      "Google Drive không tạo được phiên tải lên.",
      502,
      "DRIVE_SESSION_FAILED"
    );
  }
  return location;
}

export type ResumableState =
  | { state: "done"; file: DriveRemoteFile }
  | { state: "partial"; offset: number }
  | { state: "expired" };

export async function queryResumableUpload(
  sessionUri: string,
  totalSize: number
): Promise<ResumableState> {
  const res = await fetch(sessionUri, {
    method: "PUT",
    headers: { "Content-Range": `bytes */${totalSize}` },
    body: "",
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 200 || res.status === 201) {
    return { state: "done", file: (await res.json()) as DriveRemoteFile };
  }
  if (res.status === 308) {
    const match = /bytes=0-(\d+)/.exec(res.headers.get("range") ?? "");
    return { state: "partial", offset: match ? Number(match[1]) + 1 : 0 };
  }
  if (res.status === 404 || res.status === 410) {
    return { state: "expired" };
  }
  throw await classifyGoogleError(res);
}

export async function cancelResumableUpload(sessionUri: string): Promise<void> {
  await fetch(sessionUri, {
    method: "DELETE",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

/**
 * Server-side resumable upload for files larger than 5 MiB.
 * Uploads in 8 MiB chunks and queries 308 Range offset on transient retry.
 */
export async function uploadResumableServerToDrive(
  connectionId: string,
  input: {
    name: string;
    mimeType: string;
    data: Buffer;
    parentId?: string;
    appProperties?: Record<string, string>;
    chunkSize?: number;
  }
): Promise<DriveRemoteFile> {
  const total = input.data.byteLength;
  const chunkSize = input.chunkSize ?? DRIVE_CHUNK_SIZE;
  const sessionUri = await startResumableUpload(connectionId, {
    name: input.name,
    mimeType: input.mimeType,
    size: total,
    parentId: input.parentId,
    appProperties: input.appProperties,
  });

  let offset = 0;
  let retries = 0;

  while (offset < total) {
    const end = Math.min(offset + chunkSize, total);
    const chunk = input.data.subarray(offset, end);
    const res = await fetch(sessionUri, {
      method: "PUT",
      headers: {
        "Content-Type": input.mimeType,
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${offset}-${end - 1}/${total}`,
      },
      body: new Uint8Array(chunk),
      signal: AbortSignal.timeout(120_000),
    });

    if (res.status === 200 || res.status === 201) {
      return (await res.json()) as DriveRemoteFile;
    }
    if (res.status === 308) {
      const rangeMatch = /bytes=0-(\d+)/.exec(res.headers.get("range") ?? "");
      offset = rangeMatch ? Number(rangeMatch[1]) + 1 : end;
      retries = 0;
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && retries < 3) {
      retries++;
      await sleep(backoffBaseMs * 2 ** retries);
      const state = await queryResumableUpload(sessionUri, total);
      if (state.state === "done") return state.file;
      if (state.state === "partial") {
        offset = state.offset;
        continue;
      }
      throw new AppError(
        "Phiên tải lên Google Drive đã hết hạn.",
        410,
        "DRIVE_SESSION_EXPIRED"
      );
    }
    throw await classifyGoogleError(res);
  }

  // Final status check if loop exited at exact boundary without 200/201
  const finalState = await queryResumableUpload(sessionUri, total);
  if (finalState.state === "done") return finalState.file;
  throw new AppError("Tải tệp lên Google Drive chưa hoàn tất.", 502, "DRIVE_UPLOAD_INCOMPLETE");
}

export async function uploadBufferToDrive(
  connectionId: string,
  input: {
    name: string;
    mimeType: string;
    data: Buffer;
    parentId?: string;
    appProperties?: Record<string, string>;
  }
): Promise<DriveRemoteFile> {
  if (input.data.byteLength <= DRIVE_MULTIPART_MAX_BYTES) {
    return uploadMultipartToDrive(connectionId, input);
  }
  return uploadResumableServerToDrive(connectionId, input);
}

// ---------------------------------------------------------------------------
// Read, Stream (with Range support), Trash & Permissions
// ---------------------------------------------------------------------------
export async function getDriveFileMetadata(
  connectionId: string,
  driveFileId: string
): Promise<DriveRemoteFile> {
  const res = await driveFetch(
    connectionId,
    `${getDriveApiBase()}/files/${encodeURIComponent(driveFileId)}?fields=${FILE_FIELDS}`
  );
  return parseJsonOrThrow<DriveRemoteFile>(res);
}

export async function downloadDriveStream(
  connectionId: string,
  driveFileId: string,
  range?: string | null
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (range && /^bytes=\d*-\d*$/.test(range.trim())) {
    headers.Range = range.trim();
  }
  const res = await driveFetch(
    connectionId,
    `${getDriveApiBase()}/files/${encodeURIComponent(driveFileId)}?alt=media`,
    {
      headers,
      signal: AbortSignal.timeout(15 * 60 * 1000),
    }
  );
  if (!res.ok) throw await classifyGoogleError(res);
  return res;
}

export async function downloadDriveBuffer(
  connectionId: string,
  driveFileId: string
): Promise<{ buffer: Buffer; contentType: string; size: number }> {
  const res = await downloadDriveStream(connectionId, driveFileId);
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    buffer,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
    size: buffer.byteLength,
  };
}

export async function readDriveFileHead(
  connectionId: string,
  driveFileId: string,
  bytes = 4096
): Promise<Buffer> {
  const res = await driveFetch(
    connectionId,
    `${getDriveApiBase()}/files/${encodeURIComponent(driveFileId)}?alt=media`,
    {
      headers: { Range: `bytes=0-${bytes - 1}` },
    }
  );
  if (!res.ok) throw await classifyGoogleError(res);
  const full = Buffer.from(await res.arrayBuffer());
  return full.subarray(0, bytes);
}

/** Moves a file to Google Drive trash (`trashed=true`), never permanent delete. Idempotent on 404. */
export async function trashDriveFile(connectionId: string, driveFileId: string): Promise<void> {
  const res = await driveFetch(
    connectionId,
    `${getDriveApiBase()}/files/${encodeURIComponent(driveFileId)}?fields=id`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ trashed: true }),
    }
  );
  if (res.status === 404) return;
  if (!res.ok) throw await classifyGoogleError(res);
}

/**
 * Takes a file out of Google Drive's trash. Returns false when the file no longer exists
 * (trash emptied / deleted forever), true otherwise.
 */
export async function untrashDriveFile(connectionId: string, driveFileId: string): Promise<boolean> {
  const res = await driveFetch(
    connectionId,
    `${getDriveApiBase()}/files/${encodeURIComponent(driveFileId)}?fields=id`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ trashed: false }),
    }
  );
  if (res.status === 404) return false;
  if (!res.ok) throw await classifyGoogleError(res);
  return true;
}

/**
 * Ids of this app's files that are currently in Google Drive's trash (drive.file scope only lists
 * files the app created or was given), e.g. after an admin deleted them directly in Drive.
 */
export async function listTrashedDriveFileIds(connectionId: string, maxPages = 20): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      q: "trashed = true and mimeType != 'application/vnd.google-apps.folder'",
      pageSize: "1000",
      fields: "nextPageToken,files(id)",
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await driveFetch(connectionId, `${getDriveApiBase()}/files?${params}`);
    const body = await parseJsonOrThrow<{ nextPageToken?: string; files?: Array<{ id: string }> }>(res);
    for (const f of body.files ?? []) ids.push(f.id);
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return ids;
}

export async function listDriveFolderFiles(
  connectionId: string,
  folderId?: string,
  search?: string
): Promise<DriveRemoteFile[]> {
  const clauses = ["trashed = false", "mimeType != 'application/vnd.google-apps.folder'"];
  if (folderId) {
    clauses.push(`'${escapeDriveQuery(folderId)}' in parents`);
  }
  if (search?.trim()) {
    clauses.push(`name contains '${escapeDriveQuery(search.trim())}'`);
  }
  const params = new URLSearchParams({
    q: clauses.join(" and "),
    pageSize: "50",
    orderBy: "createdTime desc",
    fields: `files(${FILE_FIELDS})`,
  });
  const res = await driveFetch(connectionId, `${getDriveApiBase()}/files?${params}`);
  return (await parseJsonOrThrow<{ files?: DriveRemoteFile[] }>(res)).files ?? [];
}

export async function listDrivePermissions(
  connectionId: string,
  driveFileId: string
): Promise<Array<{ id: string; type: string; role: string }>> {
  const res = await driveFetch(
    connectionId,
    `${getDriveApiBase()}/files/${encodeURIComponent(
      driveFileId
    )}/permissions?fields=permissions(id,type,role)`
  );
  return (
    (await parseJsonOrThrow<{ permissions?: Array<{ id: string; type: string; role: string }> }>(
      res
    )).permissions ?? []
  );
}

/** Only called for lesson videos when admin explicitly enabled `allowPublicLessonVideos`. */
export async function ensurePublicReader(
  connectionId: string,
  driveFileId: string
): Promise<void> {
  const perms = await listDrivePermissions(connectionId, driveFileId);
  if (perms.some((p) => p.type === "anyone" && p.role === "reader")) return;
  const res = await driveFetch(
    connectionId,
    `${getDriveApiBase()}/files/${encodeURIComponent(driveFileId)}/permissions?fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false }),
    },
    { retryNonIdempotent: true }
  );
  await parseJsonOrThrow<{ id: string }>(res);
}

export async function revokePublicReader(
  connectionId: string,
  driveFileId: string
): Promise<void> {
  const perms = await listDrivePermissions(connectionId, driveFileId);
  for (const p of perms.filter((perm) => perm.type === "anyone")) {
    const res = await driveFetch(
      connectionId,
      `${getDriveApiBase()}/files/${encodeURIComponent(
        driveFileId
      )}/permissions/${encodeURIComponent(p.id)}`,
      { method: "DELETE" }
    );
    if (!res.ok && res.status !== 404) throw await classifyGoogleError(res);
  }
}

export function drivePreviewUrl(driveFileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`;
}
