import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateTotp } from "@/lib/totp";
import { createAccount, listLoginHistory, signOutAllDevices } from "@/server/accountService";
import { evaluateGoogleSignIn } from "@/server/authSecurityService";
import { setExternalNotifyTestHooks } from "@/server/externalNotifyService";
import { completePasswordReset, requestPasswordReset } from "@/server/passwordResetService";
import {
  beginAdminTotpSetup,
  confirmEnableAdminTotp,
  disableAdminTotp,
  verifyAdminTotpOrBackupCode,
} from "@/server/totpService";

const suffix = `p26_${Date.now()}`;
let adminId = "";
let teacherId = "";
let studentId = "";
let lockedUserId = "";

beforeAll(async () => {
  const admin = await prisma.user.findUnique({ where: { email: "admin@engclass.vn" } });
  if (!admin) throw new Error("Admin seed account missing");
  adminId = admin.id;

  const [t, s, l] = await Promise.all([
    createAccount(
      { id: adminId, role: "ADMIN" },
      { name: `T26 ${suffix}`, email: `t_${suffix}@test.local`, role: "TEACHER", password: "password123" }
    ),
    createAccount(
      { id: adminId, role: "ADMIN" },
      { name: `S26 ${suffix}`, email: `s_${suffix}@test.local`, role: "STUDENT", password: "password123" }
    ),
    createAccount(
      { id: adminId, role: "ADMIN" },
      { name: `L26 ${suffix}`, email: `l_${suffix}@test.local`, role: "TEACHER", password: "password123" }
    ),
  ]);
  teacherId = t.user.id;
  studentId = s.user.id;
  lockedUserId = l.user.id;

  await prisma.user.update({
    where: { id: lockedUserId },
    data: { isLocked: true },
  });
});

afterAll(async () => {
  setExternalNotifyTestHooks({});
  await prisma.passwordResetToken.deleteMany({
    where: { userId: { in: [teacherId, studentId, lockedUserId] } },
  });
  await prisma.loginSessionLog.deleteMany({
    where: { userId: { in: [teacherId, studentId, lockedUserId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [teacherId, studentId, lockedUserId] } },
  });
});

describe("Phase 26 Integration: Google Allow-list, Password Reset, Teacher 2FA & Session Management", () => {
  it("enforces strict pre-provisioned allow-list on Google OAuth sign-in and masks IP in session log", async () => {
    const unknownEmail = `stranger_${suffix}@gmail.com`;
    const resUnknown = await evaluateGoogleSignIn({
      email: unknownEmail,
      emailVerified: true,
      ip: "203.0.113.44",
    });
    expect(resUnknown).toEqual({ ok: false, errorCode: "AccountNotProvisioned" });
    expect(await prisma.user.findUnique({ where: { email: unknownEmail } })).toBeNull();

    const resUnverified = await evaluateGoogleSignIn({
      email: `t_${suffix}@test.local`,
      emailVerified: false,
    });
    expect(resUnverified).toEqual({ ok: false, errorCode: "AccountNotProvisioned" });

    const resLocked = await evaluateGoogleSignIn({
      email: `l_${suffix}@test.local`,
      emailVerified: true,
    });
    expect(resLocked).toEqual({ ok: false, errorCode: "AccountLocked" });

    const resOk = await evaluateGoogleSignIn({
      email: `t_${suffix}@test.local`,
      emailVerified: true,
      ip: "198.51.100.88",
      userAgent: "Phase26TestBrowser/1.0",
    });
    expect(resOk.ok).toBe(true);
    if (resOk.ok) {
      expect(resOk.user.id).toBe(teacherId);
    }

    const sessions = await listLoginHistory(teacherId);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0]!.ipMasked).toBe("198.51.x.x");
    expect(sessions[0]!.provider).toBe("google");
  });

  it("handles anti-enumeration password reset tokens (expired, 1-time use, session invalidation)", async () => {
    const sentEmails: Array<{ to: string; text?: string }> = [];
    setExternalNotifyTestHooks({
      emailSender: {
        sendMail: vi.fn(async (msg: { to: string; text?: string }) => {
          sentEmails.push(msg);
          return { messageId: "mock-id" };
        }),
      },
    });

    const ghostRes = await requestPasswordReset(`nobody_${suffix}@test.local`, "10.0.0.1");
    const realTokens: string[] = [];
    const realRes = await requestPasswordReset(`s_${suffix}@test.local`, "10.0.0.1", {
      onTokenCreated: (tok) => realTokens.push(tok),
    });

    // Anti-enumeration: identical outward message
    expect(ghostRes.message).toBe(realRes.message);
    expect(realTokens).toHaveLength(1);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.text).toContain(realTokens[0]!);

    // Token stored as SHA-256 hash only
    const hash = crypto.createHash("sha256").update(realTokens[0]!).digest("hex");
    const dbRow = await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: hash } });
    expect(dbRow.usedAt).toBeNull();

    // Expired token rejected
    const expiredRaw = crypto.randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: studentId,
        tokenHash: crypto.createHash("sha256").update(expiredRaw).digest("hex"),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await expect(completePasswordReset(expiredRaw, "NewSecretPass99!")).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_RESET_TOKEN",
    });

    // Valid token succeeds & revokes prior sessions via passwordChangedAt
    const beforeUser = await prisma.user.findUniqueOrThrow({ where: { id: studentId } });
    await completePasswordReset(realTokens[0]!, "NewSecretPass99!");
    const afterUser = await prisma.user.findUniqueOrThrow({ where: { id: studentId } });
    expect(afterUser.passwordChangedAt).toBeTruthy();
    expect(afterUser.passwordChangedAt!.getTime()).toBeGreaterThanOrEqual(
      beforeUser.passwordChangedAt?.getTime() ?? 0
    );

    // Single-use replay rejected
    await expect(completePasswordReset(realTokens[0]!, "AnotherPass88!")).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_RESET_TOKEN",
    });
  });

  it("allows TEACHER accounts to setup/verify/disable TOTP 2FA while rejecting STUDENT accounts", async () => {
    await expect(beginAdminTotpSetup(studentId)).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });

    const setup = await beginAdminTotpSetup(teacherId);
    const rawSecret = setup.manualKey.replace(/\s+/g, "");
    const step = Math.floor(Date.now() / 1000 / 30);
    const code = generateTotp(rawSecret, step * 30_000);

    const enabled = await confirmEnableAdminTotp(teacherId, code);
    expect(enabled.enabled).toBe(true);
    expect(enabled.backupCodes).toHaveLength(8);

    // Same step blocked from replay; next step accepted
    const replay = await verifyAdminTotpOrBackupCode(teacherId, code, { nowMs: step * 30_000 });
    expect(replay.valid).toBe(false);

    const nextStepMs = (step + 1) * 30_000;
    const nextCode = generateTotp(rawSecret, nextStepMs);
    const validNext = await verifyAdminTotpOrBackupCode(teacherId, nextCode, { nowMs: nextStepMs });
    expect(validNext).toEqual({ valid: true, usedBackupCode: false });

    // Disable with backup code
    await disableAdminTotp(teacherId, "password123", enabled.backupCodes[0]!);
    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: teacherId } });
    expect(refreshed.totpEnabled).toBe(false);
  });

  it("signOutAllDevices updates passwordChangedAt and logs AuditLog", async () => {
    const res = await signOutAllDevices(teacherId);
    expect(res.ok).toBe(true);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: teacherId } });
    expect(updated.passwordChangedAt).toBeInstanceOf(Date);

    const audit = await prisma.auditLog.findFirst({
      where: { actorId: teacherId, action: "SESSIONS_REVOKED_ALL" },
    });
    expect(audit).toBeTruthy();
  });
});
