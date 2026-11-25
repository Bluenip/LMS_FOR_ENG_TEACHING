import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/db";
import {
  clearAccessTokenCache,
  encryptSecret,
  getAccessTokenForConnection,
  setDriveBackoffBaseMsForTests,
  SHARED_SCOPE_KEY,
  uploadResumableServerToDrive,
  userScopeKey,
} from "@/lib/drive/google-drive";
import { getStorageProvider, resetStorageProviderCache } from "@/lib/storage";
import {
  authorizeDriveFileAccess,
  backupWorksheetToDrive,
  disconnectDriveConnection,
  importWorksheetFromDrive,
  pruneDrive,
} from "@/server/driveService";
import {
  createWorksheet,
  deleteWorksheet,
  getWorksheetForTeacher,
  saveWorksheetFields,
  uploadWorksheetPdf,
} from "@/server/worksheetService";
import {
  getAuthorizedAudioRangeStream,
  requestAudioPlay,
  uploadWorksheetAudio,
} from "@/server/worksheetAudioService";
import { startOrResumeSubmission } from "@/server/submissionService";

interface FakeDriveNode {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  appProperties: Record<string, string>;
  data: Buffer;
  trashed: boolean;
  permissions: Array<{ id: string; type: string; role: string }>;
}

/**
 * In-memory mock of Google OAuth + Drive REST v3 API for full end-to-end integration tests.
 */
function createFakeGoogleFetch() {
  let seq = 1;
  const nodes = new Map<string, FakeDriveNode>();
  const resumableSessions = new Map<
    string,
    {
      name: string;
      mimeType: string;
      parents: string[];
      appProperties: Record<string, string>;
      totalSize: number;
      chunks: Map<number, Buffer>;
      failOnce503?: boolean;
    }
  >();

  let failTokenInvalidGrant = false;
  let failUploadsQuotaExceeded = false;
  let rateLimitOnce = false;

  const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();

    // 1. OAuth token refresh
    if (urlStr.includes("oauth2.googleapis.com/token")) {
      if (failTokenInvalidGrant) {
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      }
      return new Response(
        JSON.stringify({
          access_token: "ya29.fake-access-token",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/drive.file",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (urlStr.includes("oauth2.googleapis.com/revoke")) {
      return new Response("", { status: 200 });
    }

    // 2. Drive about
    if (urlStr.includes("/drive/v3/about")) {
      return new Response(
        JSON.stringify({
          user: { emailAddress: "drive-school@engclass.vn" },
          storageQuota: { usage: "104857600", limit: "16106127360" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Resumable session PUT
    if (urlStr.startsWith("https://mock-upload.google.test/session/")) {
      const session = resumableSessions.get(urlStr);
      if (!session) return new Response("Not found", { status: 410 });
      if (method === "DELETE") {
        resumableSessions.delete(urlStr);
        return new Response("", { status: 499 });
      }
      const headers = new Headers(init?.headers);
      const contentRange = headers.get("content-range") ?? "";

      // Status probe: bytes */total
      if (contentRange.startsWith("bytes */")) {
        const uploaded = Array.from(session.chunks.values()).reduce((s, b) => s + b.byteLength, 0);
        return new Response(null, {
          status: 308,
          headers: uploaded > 0 ? { Range: `bytes=0-${uploaded - 1}` } : {},
        });
      }

      if (session.failOnce503) {
        session.failOnce503 = false;
        return new Response("Temporary error", { status: 503 });
      }

      const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
      if (!m) return new Response("Bad Range", { status: 400 });
      const start = Number(m[1]);
      const end = Number(m[2]);
      const total = Number(m[3]);
      const bodyBuf = Buffer.from((init?.body as Uint8Array) ?? new Uint8Array());
      session.chunks.set(start, bodyBuf);

      if (end + 1 < total) {
        return new Response(null, { status: 308, headers: { Range: `bytes=0-${end}` } });
      }

      const ordered = Array.from(session.chunks.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, buf]) => buf);
      const fullData = Buffer.concat(ordered);
      const id = `drv_file_${seq++}`;
      const node: FakeDriveNode = {
        id,
        name: session.name,
        mimeType: session.mimeType,
        parents: session.parents,
        appProperties: session.appProperties,
        data: fullData,
        trashed: false,
        permissions: [],
      };
      nodes.set(id, node);
      resumableSessions.delete(urlStr);
      return new Response(
        JSON.stringify({
          id: node.id,
          name: node.name,
          mimeType: node.mimeType,
          size: String(fullData.byteLength),
          appProperties: node.appProperties,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Upload endpoint: multipart or resumable init
    if (urlStr.includes("/upload/drive/v3/files")) {
      if (failUploadsQuotaExceeded) {
        return new Response(
          JSON.stringify({ error: { errors: [{ reason: "storageQuotaExceeded" }] } }),
          { status: 403 }
        );
      }
      if (rateLimitOnce) {
        rateLimitOnce = false;
        return new Response(
          JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } }),
          { status: 403 }
        );
      }

      const u = new URL(urlStr);
      const uploadType = u.searchParams.get("uploadType");

      if (uploadType === "resumable") {
        const meta = JSON.parse(String(init?.body ?? "{}")) as {
          name: string;
          mimeType: string;
          parents?: string[];
          appProperties?: Record<string, string>;
        };
        const headers = new Headers(init?.headers);
        const totalSize = Number(headers.get("x-upload-content-length") ?? "0");
        const sessionUrl = `https://mock-upload.google.test/session/${seq++}`;
        resumableSessions.set(sessionUrl, {
          name: meta.name,
          mimeType: meta.mimeType,
          parents: meta.parents ?? [],
          appProperties: meta.appProperties ?? {},
          totalSize,
          chunks: new Map(),
          failOnce503: true, // exercises automatic 308 resume on first chunk failure!
        });
        return new Response("", { status: 200, headers: { Location: sessionUrl } });
      }

      if (uploadType === "multipart") {
        const rawBuf = Buffer.from(init?.body as Uint8Array);
        const ct = new Headers(init?.headers).get("content-type") ?? "";
        const boundaryMatch = /boundary=([^\s;]+)/.exec(ct);
        const boundary = boundaryMatch![1]!;
        const sep = Buffer.from(`--${boundary}`);
        const firstIdx = rawBuf.indexOf(sep);
        const secondIdx = rawBuf.indexOf(sep, firstIdx + sep.length);
        const thirdIdx = rawBuf.indexOf(sep, secondIdx + sep.length);

        const part1 = rawBuf.subarray(firstIdx + sep.length, secondIdx);
        const jsonStart = part1.indexOf("\r\n\r\n") + 4;
        const meta = JSON.parse(part1.subarray(jsonStart).toString("utf8").trim()) as {
          name: string;
          mimeType: string;
          parents?: string[];
          appProperties?: Record<string, string>;
        };

        const part2 = rawBuf.subarray(secondIdx + sep.length, thirdIdx);
        const dataStart = part2.indexOf("\r\n\r\n") + 4;
        // Strip trailing \r\n before final boundary
        const fileBytes = part2.subarray(dataStart, part2.length - 2);

        const id = `drv_file_${seq++}`;
        const node: FakeDriveNode = {
          id,
          name: meta.name,
          mimeType: meta.mimeType,
          parents: meta.parents ?? [],
          appProperties: meta.appProperties ?? {},
          data: Buffer.from(fileBytes),
          trashed: false,
          permissions: [],
        };
        nodes.set(id, node);

        return new Response(
          JSON.stringify({
            id: node.id,
            name: node.name,
            mimeType: node.mimeType,
            size: String(node.data.byteLength),
            parents: node.parents,
            appProperties: node.appProperties,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // 5. Drive API v3 /files (list / create folder / get / download / patch / permissions)
    if (urlStr.includes("/drive/v3/files")) {
      const u = new URL(urlStr);
      const pathPart = u.pathname.replace(/^.*\/drive\/v3\/files/, "");

      // POST /files (create folder)
      if (!pathPart && method === "POST") {
        const meta = JSON.parse(String(init?.body ?? "{}")) as {
          name: string;
          mimeType: string;
          parents?: string[];
          appProperties?: Record<string, string>;
        };
        const id = `drv_folder_${seq++}`;
        nodes.set(id, {
          id,
          name: meta.name,
          mimeType: meta.mimeType,
          parents: meta.parents ?? [],
          appProperties: meta.appProperties ?? {},
          data: Buffer.alloc(0),
          trashed: false,
          permissions: [],
        });
        return new Response(JSON.stringify({ id }), { status: 200 });
      }

      // GET /files (query)
      if (!pathPart && method === "GET") {
        const q = u.searchParams.get("q") ?? "";
        const propMatch = /key='([^']+)' and value='([^']+)'/.exec(q);
        const matches = Array.from(nodes.values()).filter((n) => {
          if (n.trashed) return false;
          if (propMatch) {
            return n.appProperties[propMatch[1]!] === propMatch[2]!;
          }
          return true;
        });
        return new Response(
          JSON.stringify({
            files: matches.map((n) => ({
              id: n.id,
              name: n.name,
              mimeType: n.mimeType,
              parents: n.parents,
              size: String(n.data.byteLength),
            })),
          }),
          { status: 200 }
        );
      }

      // Permissions endpoints
      const permMatch = /^\/([^/]+)\/permissions(?:\/([^/]+))?$/.exec(pathPart);
      if (permMatch) {
        const node = nodes.get(decodeURIComponent(permMatch[1]!));
        if (!node) return new Response("{}", { status: 404 });
        if (method === "GET") {
          return new Response(JSON.stringify({ permissions: node.permissions }), { status: 200 });
        }
        if (method === "POST") {
          const p = JSON.parse(String(init?.body ?? "{}")) as { type: string; role: string };
          const pid = `perm_${seq++}`;
          node.permissions.push({ id: pid, ...p });
          return new Response(JSON.stringify({ id: pid }), { status: 200 });
        }
        if (method === "DELETE" && permMatch[2]) {
          node.permissions = node.permissions.filter((p) => p.id !== permMatch[2]);
          return new Response("", { status: 204 });
        }
      }

      // Single file operations: /files/:id
      const fileId = decodeURIComponent(pathPart.replace(/^\//, ""));
      const node = nodes.get(fileId);
      if (!node) return new Response("{}", { status: 404 });

      if (method === "GET" && u.searchParams.get("alt") === "media") {
        const range = new Headers(init?.headers).get("range");
        if (range) {
          const rm = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (rm) {
            const start = rm[1] ? Number(rm[1]) : 0;
            const end = rm[2] ? Math.min(Number(rm[2]), node.data.byteLength - 1) : node.data.byteLength - 1;
            const slice = node.data.subarray(start, end + 1);
            return new Response(new Uint8Array(slice), {
              status: 206,
              headers: {
                "Content-Type": node.mimeType,
                "Content-Length": String(slice.byteLength),
                "Content-Range": `bytes ${start}-${end}/${node.data.byteLength}`,
              },
            });
          }
        }
        return new Response(new Uint8Array(node.data), {
          status: 200,
          headers: {
            "Content-Type": node.mimeType,
            "Content-Length": String(node.data.byteLength),
          },
        });
      }

      if (method === "GET") {
        return new Response(
          JSON.stringify({
            id: node.id,
            name: node.name,
            mimeType: node.mimeType,
            size: String(node.data.byteLength),
            parents: node.parents,
            trashed: node.trashed,
            appProperties: node.appProperties,
          }),
          { status: 200 }
        );
      }

      if (method === "PATCH") {
        const patch = JSON.parse(String(init?.body ?? "{}")) as {
          name?: string;
          trashed?: boolean;
        };
        if (patch.name) node.name = patch.name;
        if (patch.trashed !== undefined) node.trashed = patch.trashed;
        return new Response(JSON.stringify({ id: node.id }), { status: 200 });
      }
    }

    throw new Error(`Unhandled mocked URL: ${method} ${urlStr}`);
  });

  return {
    mockFetch,
    nodes,
    setFailInvalidGrant: (v: boolean) => {
      failTokenInvalidGrant = v;
    },
    setFailQuotaExceeded: (v: boolean) => {
      failUploadsQuotaExceeded = v;
    },
    setRateLimitOnce: (v: boolean) => {
      rateLimitOnce = v;
    },
  };
}

async function createMinimalPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

function createMinimalWav(): Buffer {
  const buf = Buffer.alloc(64);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(56, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(8000, 24);
  buf.writeUInt32LE(8000, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(20, 40);
  return buf;
}

describe("Phase 12: Google Drive StorageProvider, Backup/Import, Access Control & Prune", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.STORAGE_DRIVER = "drive";
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.DRIVE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.APP_URL = "http://localhost:3000";
    setDriveBackoffBaseMsForTests(1);
    resetStorageProviderCache();
    clearAccessTokenCache();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    resetStorageProviderCache();
    clearAccessTokenCache();
    vi.restoreAllMocks();
    await prisma.driveTrash.deleteMany({});
    await prisma.driveFile.deleteMany({});
    await prisma.driveUpload.deleteMany({});
    await prisma.driveConnection.deleteMany({});
  });

  it("Runs full Drive flow: upload PDF + audio (private), Range stream, backup -> import into teacher2, delete -> DriveTrash -> prune", async () => {
    const fake = createFakeGoogleFetch();
    vi.stubGlobal("fetch", fake.mockFetch);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@engclass.vn" } });
    const teacher1 = await prisma.user.findUniqueOrThrow({ where: { email: "teacher1@engclass.vn" } });
    const teacher2 = await prisma.user.findUniqueOrThrow({ where: { email: "teacher2@engclass.vn" } });
    const student1 = await prisma.user.findUniqueOrThrow({ where: { email: "student1@engclass.vn" } });
    const parent1 = await prisma.user.findUniqueOrThrow({ where: { email: "parent1@engclass.vn" } });
    const outsider = await prisma.user.findUniqueOrThrow({ where: { email: "student9@engclass.vn" } });
    const cls1 = await prisma.class.findUniqueOrThrow({ where: { joinCode: "ENG12A" } });

    const sharedConn = await prisma.driveConnection.create({
      data: {
        scopeKey: SHARED_SCOPE_KEY,
        ownerId: null,
        connectedById: admin.id,
        email: "drive-school@engclass.vn",
        encryptedRefreshToken: encryptSecret("refresh-shared-token"),
        scope: "https://www.googleapis.com/auth/drive.file",
        status: "ACTIVE",
      },
    });

    const ws = await createWorksheet(teacher1.id, {
      title: "Drive E2E Unit Test",
      instructions: "Test Drive storage",
    });
    let importedWsId: string | null = null;
    let asgId: string | null = null;

    try {
      // 1. Upload PDF + audio via STORAGE_DRIVER=drive (with a simulated transient rateLimit retry!)
      fake.setRateLimitOnce(true);
      const pdfBytes = await createMinimalPdf();
      const updatedWs = await uploadWorksheetPdf(ws.id, pdfBytes, "application/pdf");
      expect(updatedWs.pdfFileKey).toBeTruthy();

      const wavBytes = createMinimalWav();
      const audio = await uploadWorksheetAudio(ws.id, {
        buffer: wavBytes,
        mimeType: "audio/wav",
        originalFilename: "track1.wav",
        title: "Track 1",
      });

      await saveWorksheetFields(ws.id, [
        {
          placement: "ANSWER_SHEET",
          type: "TEXT",
          label: "1",
          prompt: "Fill in: hello",
          order: 0,
          points: 2,
          audioId: audio.id,
          answerKey: { accepted: ["hello"] },
        },
      ]);

      // Verify DriveFile mappings & storageLocations show "drive"
      const detail = await getWorksheetForTeacher(ws.id);
      expect(detail.storageLocations[updatedWs.pdfFileKey!]).toBe("drive");
      expect(detail.storageLocations[audio.fileKey]).toBe("drive");

      const driveFiles = await prisma.driveFile.findMany({ where: { worksheetId: ws.id } });
      expect(driveFiles).toHaveLength(2);
      // Verify NO file was made public!
      for (const df of driveFiles) {
        expect(df.shared).toBe(false);
        expect(fake.nodes.get(df.driveFileId)?.permissions).toHaveLength(0);
      }

      // Verify folder hierarchy matches PLAN 12.4: Pivora -> Teacher -> Worksheets -> Title
      const folderNames = Array.from(fake.nodes.values())
        .filter((n) => n.mimeType === "application/vnd.google-apps.folder")
        .map((n) => n.name);
      expect(folderNames).toContain("Pivora");
      expect(folderNames).toContain("Worksheets");
      expect(folderNames).toContain("Drive E2E Unit Test");

      // 2. Assign to class & verify student can read PDF + stream audio with HTTP Range (206)!
      const asg = await prisma.assignment.create({
        data: {
          classId: cls1.id,
          worksheetId: ws.id,
          title: "[TEST] Drive Audio Assignment",
          audioMaxPlays: 2,
        },
      });
      asgId = asg.id;

      const { submission } = await startOrResumeSubmission(asg.id, student1.id, {});
      const play = await requestAudioPlay(submission.id, audio.id, student1.id);
      const rangeAudio = await getAuthorizedAudioRangeStream(
        submission.id,
        audio.id,
        student1.id,
        play.token,
        "bytes=0-15"
      );
      expect("stream" in rangeAudio && rangeAudio.status).toBe(206);
      expect("contentRange" in rangeAudio && rangeAudio.contentRange).toBe(
        `bytes 0-15/${wavBytes.byteLength}`
      );

      // Verify PDF file access control (owner, student who started, parent of student, outsider blocked)
      const pdfDriveRow = driveFiles.find((f) => f.kind === "WORKSHEET_PDF")!;
      expect(
        await authorizeDriveFileAccess(
          { id: teacher1.id, email: teacher1.email, name: teacher1.name, role: "TEACHER" },
          pdfDriveRow
        )
      ).toBe(true);
      expect(
        await authorizeDriveFileAccess(
          { id: student1.id, email: student1.email, name: student1.name, role: "STUDENT" },
          pdfDriveRow
        )
      ).toBe(true);
      expect(
        await authorizeDriveFileAccess(
          { id: parent1.id, email: parent1.email, name: parent1.name, role: "PARENT" },
          pdfDriveRow
        )
      ).toBe(true);
      expect(
        await authorizeDriveFileAccess(
          { id: outsider.id, email: outsider.email, name: outsider.name, role: "STUDENT" },
          pdfDriveRow
        )
      ).toBe(false);

      // Verify student CANNOT directly download worksheet audio via DriveFile access check
      const audioDriveRow = driveFiles.find((f) => f.kind === "WORKSHEET_AUDIO")!;
      expect(
        await authorizeDriveFileAccess(
          { id: student1.id, email: student1.email, name: student1.name, role: "STUDENT" },
          audioDriveRow
        )
      ).toBe(false);

      // 3. Backup worksheet to Drive & import into teacher2 -> identical worksheet!
      const backupRes = await backupWorksheetToDrive(
        { id: teacher1.id, email: teacher1.email, name: teacher1.name, role: "TEACHER" },
        ws.id
      );
      expect(backupRes.fileName).toContain(".engclass.zip");

      const imported = await importWorksheetFromDrive(
        { id: teacher2.id, email: teacher2.email, name: teacher2.name, role: "TEACHER" },
        { driveFileId: backupRes.driveFileId, fileName: backupRes.fileName }
      );
      importedWsId = imported.worksheets[0]!.id;
      const restored = await prisma.worksheet.findUniqueOrThrow({
        where: { id: importedWsId },
        include: { fields: true, audios: true, pages: true },
      });
      expect(restored.ownerId).toBe(teacher2.id);
      expect(restored.pageCount).toBe(1);
      expect(restored.fields).toHaveLength(1);
      expect(restored.audios).toHaveLength(1);
      expect(restored.fields[0]?.audioId).toBe(restored.audios[0]?.id);

      // 4. Delete assignment & worksheet -> PDF & audio enter DriveTrash queue, then pruneDrive moves them to Drive trash (trashed=true)
      await prisma.assignment.delete({ where: { id: asg.id } });
      asgId = null;

      await deleteWorksheet(ws.id);
      const queuedTrash = await prisma.driveTrash.findMany({});
      expect(queuedTrash.length).toBeGreaterThanOrEqual(2);
      const queuedIds = new Set(queuedTrash.map((q) => q.driveFileId));
      expect(queuedIds.has(pdfDriveRow.driveFileId)).toBe(true);
      expect(queuedIds.has(audioDriveRow.driveFileId)).toBe(true);

      const pruneRes = await pruneDrive(0);
      expect(pruneRes.trashedOnDrive).toBeGreaterThanOrEqual(2);
      expect(fake.nodes.get(pdfDriveRow.driveFileId)?.trashed).toBe(true);
      expect(fake.nodes.get(audioDriveRow.driveFileId)?.trashed).toBe(true);
      expect(await prisma.driveTrash.count()).toBe(0);

      // 5. Server-side resumable upload (> chunk size) with 503 -> 308 resume recovery!
      const bigData = Buffer.alloc(600_000, 0x41);
      const resumedFile = await uploadResumableServerToDrive(sharedConn.id, {
        name: "large-file.bin",
        mimeType: "application/octet-stream",
        data: bigData,
        chunkSize: 256 * 1024,
      });
      expect(fake.nodes.get(resumedFile.id)?.data.byteLength).toBe(600_000);

      // 6. storageQuotaExceeded -> HTTP 507
      fake.setFailQuotaExceeded(true);
      await expect(
        getStorageProvider().put("worksheets/quota-test/de.pdf", pdfBytes, "application/pdf")
      ).rejects.toMatchObject({ statusCode: 507, code: "DRIVE_QUOTA_EXCEEDED" });
      fake.setFailQuotaExceeded(false);

      // 7. invalid_grant -> marks DriveConnection REVOKED!
      clearAccessTokenCache(sharedConn.id);
      fake.setFailInvalidGrant(true);
      await expect(getAccessTokenForConnection(sharedConn.id)).rejects.toMatchObject({
        statusCode: 409,
        code: "DRIVE_REVOKED",
      });
      const revokedRow = await prisma.driveConnection.findUniqueOrThrow({
        where: { id: sharedConn.id },
      });
      expect(revokedRow.status).toBe("REVOKED");
    } finally {
      if (asgId) await prisma.assignment.deleteMany({ where: { id: asgId } }).catch(() => {});
      await prisma.worksheet.deleteMany({ where: { id: ws.id } }).catch(() => {});
      if (importedWsId) await prisma.worksheet.deleteMany({ where: { id: importedWsId } }).catch(() => {});
    }
  });

  it("Prefers teacher personal Drive over shared Drive, preserves rootFolderId on disconnect, and falls back to local when unconnected", async () => {
    const fake = createFakeGoogleFetch();
    vi.stubGlobal("fetch", fake.mockFetch);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@engclass.vn" } });
    const teacher1 = await prisma.user.findUniqueOrThrow({ where: { email: "teacher1@engclass.vn" } });

    // No connection active -> DriveStorageProvider gracefully falls back to local storage!
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fallbackRes = await getStorageProvider().put(
      "worksheets/fallback-test/test.txt",
      Buffer.from("hello fallback"),
      "text/plain"
    );
    expect(fallbackRes.driver).toBe("local");
    expect(warnSpy).toHaveBeenCalled();
    await getStorageProvider().delete("worksheets/fallback-test/test.txt");

    // Create BOTH shared and teacher1 personal connections
    await prisma.driveConnection.create({
      data: {
        scopeKey: SHARED_SCOPE_KEY,
        ownerId: null,
        connectedById: admin.id,
        email: "shared@engclass.vn",
        encryptedRefreshToken: encryptSecret("shared-token"),
        scope: "https://www.googleapis.com/auth/drive.file",
        status: "ACTIVE",
        rootFolderId: "root-shared",
      },
    });
    const personalConn = await prisma.driveConnection.create({
      data: {
        scopeKey: userScopeKey(teacher1.id),
        ownerId: teacher1.id,
        connectedById: teacher1.id,
        email: "teacher1-personal@gmail.com",
        encryptedRefreshToken: encryptSecret("personal-token"),
        scope: "https://www.googleapis.com/auth/drive.file",
        status: "ACTIVE",
        rootFolderId: "root-personal",
      },
    });

    // Seed fake root folders so uploads succeed
    fake.nodes.set("root-personal", {
      id: "root-personal",
      name: "EngClass",
      mimeType: "application/vnd.google-apps.folder",
      parents: [],
      appProperties: { engclassRoot: "1" },
      data: Buffer.alloc(0),
      trashed: false,
      permissions: [],
    });

    const putRes = await getStorageProvider().put(
      "backups/personal-check/file.txt",
      Buffer.from("personal drive content"),
      "text/plain",
      { ownerId: teacher1.id, kind: "BACKUP", fileName: "check.txt" }
    );
    expect(putRes.driver).toBe("drive");
    const df = await prisma.driveFile.findUniqueOrThrow({
      where: { storageKey: "backups/personal-check/file.txt" },
    });
    expect(df.connectionId).toBe(personalConn.id);

    // Disconnect preserves rootFolderId & email while wiping refresh token (PLAN 12.6)
    await disconnectDriveConnection(
      { id: teacher1.id, email: teacher1.email, name: teacher1.name, role: "TEACHER" },
      "personal"
    );
    const afterDisc = await prisma.driveConnection.findUniqueOrThrow({
      where: { id: personalConn.id },
    });
    expect(afterDisc.status).toBe("DISCONNECTED");
    expect(afterDisc.encryptedRefreshToken).toBe("");
    expect(afterDisc.rootFolderId).toBe("root-personal");
    expect(afterDisc.email).toBe("teacher1-personal@gmail.com");
  });
});
