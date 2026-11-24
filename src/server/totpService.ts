import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { decryptAppSecret, encryptAppSecret } from "@/lib/crypto-secrets";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAppName } from "@/lib/utils";
import {
  buildOtpauthUri,
  findMatchingBackupCodeIndex,
  formatManualKey,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCodes,
  verifyTotp,
  type StoredBackupCode,
} from "@/lib/totp";
import { logAudit } from "@/server/auditService";

function parseStoredBackupCodes(raw: unknown): StoredBackupCode[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is StoredBackupCode =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as StoredBackupCode).salt === "string" &&
      typeof (item as StoredBackupCode).hash === "string" &&
      ((item as StoredBackupCode).usedAt === null ||
        typeof (item as StoredBackupCode).usedAt === "string")
  );
}

async function requireAdminRecord(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      totpEnabled: true,
      totpSecretEncrypted: true,
      totpBackupCodes: true,
      totpVerifiedAt: true,
      totpLastStep: true,
    },
  });
  if (!user) throw new AppError("Không tìm thấy người dùng.", 404, "NOT_FOUND");
  if (user.role !== "ADMIN") {
    throw new AppError("Xác thực 2 bước (2FA) chỉ áp dụng cho tài khoản quản trị viên.", 403, "FORBIDDEN");
  }
  return user;
}

export async function getAdminTotpStatus(userId: string) {
  const user = await requireAdminRecord(userId);
  const storedCodes = parseStoredBackupCodes(user.totpBackupCodes);
  return {
    enabled: user.totpEnabled,
    verifiedAt: user.totpVerifiedAt ? user.totpVerifiedAt.toISOString() : null,
    remainingBackupCodes: storedCodes.filter((c) => !c.usedAt).length,
  };
}

export async function beginAdminTotpSetup(userId: string) {
  const user = await requireAdminRecord(userId);
  if (user.totpEnabled) {
    throw new AppError("Xác thực 2 bước đã được bật trên tài khoản này.", 409, "TOTP_ALREADY_ENABLED");
  }

  const secret = generateTotpSecret(20);
  const encrypted = encryptAppSecret(secret, "totp");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpSecretEncrypted: encrypted,
      totpEnabled: false,
    },
  });

  const otpauthUri = buildOtpauthUri({
    issuer: getAppName(),
    accountName: user.email,
    secret,
  });
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    width: 220,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  return {
    qrDataUrl,
    manualKey: formatManualKey(secret),
    otpauthUri,
  };
}

export async function confirmEnableAdminTotp(userId: string, code: string) {
  const user = await requireAdminRecord(userId);
  if (user.totpEnabled) {
    throw new AppError("Xác thực 2 bước đã được bật trên tài khoản này.", 409, "TOTP_ALREADY_ENABLED");
  }
  if (!user.totpSecretEncrypted) {
    throw new AppError("Vui lòng tạo mã QR thiết lập 2FA trước khi xác nhận.", 400, "TOTP_SETUP_REQUIRED");
  }

  const secret = decryptAppSecret(user.totpSecretEncrypted, "totp");
  const check = verifyTotp(secret, code);
  if (!check.valid) {
    throw new AppError("Mã xác thực 6 số không đúng hoặc đã hết hạn.", 400, "INVALID_TOTP_CODE");
  }

  const plainBackupCodes = generateBackupCodes(8);
  const hashedBackupCodes = hashBackupCodes(plainBackupCodes);
  const now = new Date();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpEnabled: true,
      totpVerifiedAt: now,
      totpLastStep: check.step ?? null,
      totpBackupCodes: hashedBackupCodes as unknown as Prisma.InputJsonValue,
    },
  });

  await logAudit({
    actorId: user.id,
    action: "TOTP_ENABLED",
    targetType: "USER",
    targetId: user.id,
    summary: `Bật xác thực 2 bước (2FA) cho tài khoản ${user.email}`,
    meta: { email: user.email },
  });

  return {
    enabled: true,
    verifiedAt: now.toISOString(),
    backupCodes: plainBackupCodes,
  };
}

/**
 * Verifies a 6-digit TOTP code or one-time backup code for an admin with 2FA enabled.
 * Consumes backup codes and advances totpLastStep to prevent code replay.
 */
export async function verifyAdminTotpOrBackupCode(
  userId: string,
  rawCode: string,
  opts?: { nowMs?: number }
): Promise<{ valid: boolean; rateLimited?: boolean; usedBackupCode?: boolean }> {
  const limit = checkRateLimit(`totp-verify:${userId}`, 15, 15 * 60 * 1000);
  if (!limit.allowed) {
    return { valid: false, rateLimited: true };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      totpEnabled: true,
      totpSecretEncrypted: true,
      totpBackupCodes: true,
      totpLastStep: true,
    },
  });
  if (!user || user.role !== "ADMIN" || !user.totpEnabled || !user.totpSecretEncrypted) {
    return { valid: true };
  }

  const secret = decryptAppSecret(user.totpSecretEncrypted, "totp");
  const totpCheck = verifyTotp(secret, rawCode, {
    nowMs: opts?.nowMs,
    lastAcceptedStep: user.totpLastStep,
  });
  if (totpCheck.valid && totpCheck.step !== undefined) {
    await prisma.user.update({
      where: { id: user.id },
      data: { totpLastStep: totpCheck.step },
    });
    return { valid: true, usedBackupCode: false };
  }

  const storedCodes = parseStoredBackupCodes(user.totpBackupCodes);
  const idx = findMatchingBackupCodeIndex(rawCode, storedCodes);
  if (idx >= 0) {
    const updated = storedCodes.map((entry, i) =>
      i === idx ? { ...entry, usedAt: new Date().toISOString() } : entry
    );
    await prisma.user.update({
      where: { id: user.id },
      data: { totpBackupCodes: updated as unknown as Prisma.InputJsonValue },
    });
    return { valid: true, usedBackupCode: true };
  }

  return { valid: false };
}

export async function disableAdminTotp(userId: string, password: string, code: string) {
  const user = await requireAdminRecord(userId);
  if (!user.totpEnabled) {
    throw new AppError("Xác thực 2 bước hiện chưa được bật.", 400, "TOTP_NOT_ENABLED");
  }
  const passOk = await bcrypt.compare(password, user.passwordHash);
  if (!passOk) {
    throw new AppError("Mật khẩu hiện tại không đúng.", 400, "WRONG_PASSWORD");
  }
  const check = await verifyAdminTotpOrBackupCode(user.id, code);
  if (check.rateLimited) {
    throw new AppError("Bạn thử quá nhiều lần. Vui lòng thử lại sau.", 429, "RATE_LIMITED");
  }
  if (!check.valid) {
    throw new AppError("Mã xác thực 6 số không đúng hoặc đã hết hạn.", 400, "INVALID_TOTP_CODE");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpEnabled: false,
      totpSecretEncrypted: null,
      totpBackupCodes: Prisma.DbNull,
      totpVerifiedAt: null,
      totpLastStep: null,
    },
  });

  await logAudit({
    actorId: user.id,
    action: "TOTP_DISABLED",
    targetType: "USER",
    targetId: user.id,
    summary: `Tắt xác thực 2 bước (2FA) cho tài khoản ${user.email}`,
    meta: { email: user.email },
  });

  return { enabled: false };
}

export async function regenerateAdminBackupCodes(userId: string, password: string, code: string) {
  const user = await requireAdminRecord(userId);
  if (!user.totpEnabled) {
    throw new AppError("Xác thực 2 bước hiện chưa được bật.", 400, "TOTP_NOT_ENABLED");
  }
  const passOk = await bcrypt.compare(password, user.passwordHash);
  if (!passOk) {
    throw new AppError("Mật khẩu hiện tại không đúng.", 400, "WRONG_PASSWORD");
  }
  const check = await verifyAdminTotpOrBackupCode(user.id, code);
  if (check.rateLimited) {
    throw new AppError("Bạn thử quá nhiều lần. Vui lòng thử lại sau.", 429, "RATE_LIMITED");
  }
  if (!check.valid) {
    throw new AppError("Mã xác thực 6 số không đúng hoặc đã hết hạn.", 400, "INVALID_TOTP_CODE");
  }

  const plainBackupCodes = generateBackupCodes(8);
  const hashedBackupCodes = hashBackupCodes(plainBackupCodes);
  await prisma.user.update({
    where: { id: user.id },
    data: { totpBackupCodes: hashedBackupCodes as unknown as Prisma.InputJsonValue },
  });

  return { backupCodes: plainBackupCodes };
}
