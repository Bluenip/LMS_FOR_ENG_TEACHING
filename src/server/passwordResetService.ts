import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { logAudit } from "@/server/auditService";
import { isSmtpConfigured, sendEmailNotification } from "@/server/externalNotifyService";

const RESET_TTL_MS = 30 * 60 * 1000;

function sha256Hex(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function getResetAppOrigin(override?: string | null): string {
  const raw =
    override?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

/**
 * Initiates a self-service password reset flow.
 * Always returns the same public acknowledgement regardless of email existence to prevent enumeration.
 */
export async function requestPasswordReset(
  rawEmail: string,
  ip: string,
  opts?: {
    appOrigin?: string | null;
    now?: Date;
    onTokenCreated?: (plainToken: string) => void;
  }
): Promise<{ ok: true; smtpConfigured: boolean; emailSent: boolean; message: string }> {
  const email = rawEmail.trim().toLowerCase();
  const limit = await checkRateLimitAsync(`pw-reset:${email}:${ip}`, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    throw new AppError(
      "Bạn đã gửi quá nhiều yêu cầu đặt lại mật khẩu. Vui lòng thử lại sau 15 phút.",
      429,
      "RATE_LIMITED"
    );
  }

  const smtpConfigured = isSmtpConfigured();
  const genericMessage =
    "Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.";

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, deletedAt: true, isLocked: true },
  });

  if (!user || user.deletedAt || user.isLocked) {
    return { ok: true, smtpConfigured, emailSent: false, message: genericMessage };
  }

  const now = opts?.now ?? new Date();
  const plainToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(plainToken);
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    }),
  ]);

  opts?.onTokenCreated?.(plainToken);

  const resetUrl = `${getResetAppOrigin(opts?.appOrigin)}/reset-password?token=${encodeURIComponent(
    plainToken
  )}`;

  let emailSent = false;
  try {
    const mailRes = await sendEmailNotification({
      toEmail: user.email,
      subject: "[Pivora] Đặt lại mật khẩu tài khoản",
      text: [
        `Xin chào ${user.name},`,
        "",
        "Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Pivora của bạn.",
        `Mở liên kết sau để đặt mật khẩu mới (hiệu lực 30 phút): ${resetUrl}`,
        "",
        "Nếu bạn không yêu cầu, hãy bỏ qua email này.",
      ].join("\n"),
    });
    emailSent = Boolean(mailRes.sent);
  } catch {
    emailSent = false;
  }

  return {
    ok: true,
    smtpConfigured,
    emailSent,
    message: genericMessage,
  };
}

/**
 * Validates and consumes a one-time reset token, updating passwordHash and invalidating older sessions.
 */
export async function completePasswordReset(
  rawToken: string,
  newPassword: string,
  opts?: { now?: Date }
): Promise<{ ok: true }> {
  const token = rawToken.trim();
  if (token.length < 16) {
    throw new AppError("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", 400, "INVALID_RESET_TOKEN");
  }

  const tokenHash = sha256Hex(token);
  const now = opts?.now ?? new Date();

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: { select: { id: true, email: true, deletedAt: true, isLocked: true } },
    },
  });

  if (
    !row ||
    row.usedAt !== null ||
    row.expiresAt <= now ||
    !row.user ||
    row.user.deletedAt !== null ||
    row.user.isLocked
  ) {
    throw new AppError("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", 400, "INVALID_RESET_TOKEN");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      throw new AppError("Liên kết đặt lại mật khẩu đã được sử dụng.", 400, "INVALID_RESET_TOKEN");
    }

    await tx.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        passwordChangedAt: now,
        mustChangePassword: false,
      },
    });
  });

  await logAudit({
    actorId: row.userId,
    action: "PASSWORD_RESET_COMPLETED",
    targetType: "USER",
    targetId: row.userId,
    summary: `Người dùng ${row.user.email} đặt lại mật khẩu qua liên kết khôi phục`,
    summaryEn: `User ${row.user.email} completed self-service password reset`,
  }).catch(() => undefined);

  return { ok: true };
}
