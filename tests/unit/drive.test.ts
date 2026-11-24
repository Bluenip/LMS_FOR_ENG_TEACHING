import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertDriveOrigin,
  buildAuthorizationUrl,
  classifyGoogleError,
  decryptSecret,
  DRIVE_SCOPE,
  encryptSecret,
  newOAuthState,
  newPkceVerifier,
  pkceChallenge,
  queryResumableUpload,
  sanitizeDriveName,
  setDriveBackoffBaseMsForTests,
  statesMatch,
} from "@/lib/drive/google-drive";
import { buildDriveFolderSteps } from "@/lib/storage/drive";
import { matchesMagicSignature } from "@/server/driveService";

describe("Phase 12: Google Drive crypto, OAuth PKCE, errors, and folder naming", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.DRIVE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.APP_URL = "http://localhost:3000";
    setDriveBackoffBaseMsForTests(1);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("encrypts and decrypts refresh tokens with AES-256-GCM and rejects tampering or wrong key", () => {
    const token = "1//0gTEST-REFRESH-TOKEN-SECRET-VALUE";
    const encrypted = encryptSecret(token);

    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(encrypted).not.toContain(token);
    expect(decryptSecret(encrypted)).toBe(token);

    // Random IV ensures distinct ciphertexts for identical plaintext
    expect(encryptSecret(token)).not.toBe(encrypted);

    // Tampered ciphertext fails GCM auth tag check
    const parts = encrypted.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]!.slice(0, -2)}AA`;
    expect(() => decryptSecret(tampered)).toThrow(/Không giải mã được/);

    // Changed encryption key fails cleanly
    process.env.DRIVE_ENCRYPTION_KEY = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
    expect(() => decryptSecret(encrypted)).toThrow(/DRIVE_ENCRYPTION_KEY/);
  });

  it("generates OAuth state + PKCE S256 and builds drive.file authorization URL", () => {
    const state = newOAuthState();
    expect(statesMatch(state, state)).toBe(true);
    expect(statesMatch(state, state + "x")).toBe(false);
    expect(statesMatch(state, null)).toBe(false);

    const verifier = newPkceVerifier();
    const challenge = pkceChallenge(verifier);
    expect(challenge.length).toBeGreaterThan(30);
    expect(challenge).not.toBe(verifier);

    const req = new Request("http://localhost:3000/api/drive/connect");
    const url = new URL(buildAuthorizationUrl(req, state, challenge));
    expect(url.searchParams.get("scope")).toBe(DRIVE_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/drive/callback");
  });

  it("blocks cross-origin POST requests via assertDriveOrigin", () => {
    const okReq = new Request("http://localhost:3000/api/drive/disconnect", {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
    });
    expect(() => assertDriveOrigin(okReq)).not.toThrow();

    const evilReq = new Request("http://localhost:3000/api/drive/disconnect", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    expect(() => assertDriveOrigin(evilReq)).toThrow(/Origin/);
  });

  it("classifies Google Drive errors accurately (507 quota, 429 rate limit, 404, 503)", async () => {
    const quotaRes = new Response(
      JSON.stringify({ error: { errors: [{ reason: "storageQuotaExceeded" }] } }),
      { status: 403 }
    );
    const quotaErr = await classifyGoogleError(quotaRes);
    expect(quotaErr.statusCode).toBe(507);
    expect(quotaErr.code).toBe("DRIVE_QUOTA_EXCEEDED");

    const rateRes = new Response(
      JSON.stringify({ error: { errors: [{ reason: "userRateLimitExceeded" }] } }),
      { status: 403 }
    );
    const rateErr = await classifyGoogleError(rateRes);
    expect(rateErr.statusCode).toBe(429);
    expect(rateErr.code).toBe("DRIVE_RATE_LIMITED");

    const notFoundErr = await classifyGoogleError(new Response("{}", { status: 404 }));
    expect(notFoundErr.statusCode).toBe(404);

    const serverErr = await classifyGoogleError(new Response("{}", { status: 503 }));
    expect(serverErr.statusCode).toBe(503);
  });

  it("parses resumable upload 308 partial offset, 200 done, and 410 expired states", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 308, headers: { Range: "bytes=0-1048575" } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "drv-final", name: "vid.mp4", mimeType: "video/mp4" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 410 }));
    vi.stubGlobal("fetch", fetchMock);

    const partial = await queryResumableUpload("https://upload.example/session/1", 2_000_000);
    expect(partial).toEqual({ state: "partial", offset: 1_048_576 });

    const done = await queryResumableUpload("https://upload.example/session/1", 2_000_000);
    expect(done.state).toBe("done");
    if (done.state === "done") expect(done.file.id).toBe("drv-final");

    const expired = await queryResumableUpload("https://upload.example/session/1", 2_000_000);
    expect(expired).toEqual({ state: "expired" });
  });

  it("sanitizes folder/file names and builds the exact PLAN 12.4 folder hierarchy", () => {
    expect(sanitizeDriveName('Unit 7: "Work" / <Test>*?|')).toBe("Unit 7 Work Test");

    const wsSteps = buildDriveFolderSteps({
      kind: "WORKSHEET_PDF",
      teacherKey: "t1",
      teacherName: "Cô Mai/Phương",
      worksheetId: "ws1",
      worksheetTitle: "Unit 7: Reading*",
    });
    expect(wsSteps.map((s) => s.name)).toEqual(["Cô Mai Phương", "Worksheets", "Unit 7 Reading"]);

    const backupSteps = buildDriveFolderSteps({
      kind: "BACKUP",
      teacherKey: "t1",
      teacherName: "Cô Mai Phương",
      dateYmd: "2026-11-24",
    });
    expect(backupSteps.map((s) => s.name)).toEqual(["Cô Mai Phương", "Backups", "2026-11-24"]);

    const subSteps = buildDriveFolderSteps({
      kind: "SUBMISSION_FILE",
      teacherKey: "t1",
      teacherName: "Cô Mai Phương",
      classId: "c1",
      className: "12A1",
      assignmentId: "a1",
      assignmentTitle: "Speaking Test",
      studentId: "s1",
      studentName: "Nguyễn Văn Minh",
    });
    expect(subSteps.map((s) => s.name)).toEqual([
      "Cô Mai Phương",
      "Lớp 12A1",
      "Speaking Test",
      "Nguyễn Văn Minh",
    ]);
  });

  it("validates magic byte signatures for direct Drive uploads", () => {
    expect(matchesMagicSignature("application/pdf", Buffer.from("%PDF-1.7\n"))).toBe(true);
    expect(matchesMagicSignature("application/pdf", Buffer.from("NOTPDF"))).toBe(false);
    expect(
      matchesMagicSignature("video/mp4", Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]))
    ).toBe(true);
    expect(matchesMagicSignature("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
  });
});
