import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";

export type SecretPurpose = "totp" | "export";

function resolveKeySource(): { tag: "totp" | "auth"; rawSecret: string } {
  const totpKey = process.env.TOTP_ENCRYPTION_KEY?.trim() ?? "";
  if (totpKey.length >= 32) {
    return { tag: "totp", rawSecret: totpKey };
  }
  if (totpKey.length > 0) {
    // a key was configured but is too weak: fail loudly instead of silently using AUTH_SECRET
    throw new AppError(
      "TOTP_ENCRYPTION_KEY phải dài ít nhất 32 ký tự.",
      503,
      "SECRET_KEY_TOO_SHORT"
    );
  }
  const authSecret = process.env.AUTH_SECRET?.trim() ?? "";
  if (authSecret.length >= 16) {
    return { tag: "auth", rawSecret: authSecret };
  }
  throw new AppError(
    "Chưa cấu hình khoá mã hoá (TOTP_ENCRYPTION_KEY hoặc AUTH_SECRET).",
    503,
    "SECRET_KEY_NOT_CONFIGURED"
  );
}

function deriveKeyForTag(tag: "totp" | "auth", purpose: SecretPurpose): Buffer {
  const rawSecret =
    tag === "totp"
      ? (process.env.TOTP_ENCRYPTION_KEY?.trim() ?? "")
      : (process.env.AUTH_SECRET?.trim() ?? "");

  const minLen = tag === "totp" ? 32 : 16;
  if (rawSecret.length < minLen) {
    throw new AppError(
      "Không tìm thấy khoá mã hoá phù hợp để giải mã dữ liệu bảo mật.",
      500,
      "SECRET_DECRYPT_ERROR"
    );
  }
  return createHash("sha256").update(`engclass:${purpose}:${tag}:${rawSecret}`).digest();
}

/**
 * Encrypts sensitive strings (TOTP secrets, one-time password exports) with AES-256-GCM.
 * Envelope records which env secret was used (`v1:totp` vs `v1:auth`) so setting
 * `TOTP_ENCRYPTION_KEY` later does not break previously encrypted records.
 */
export function encryptAppSecret(plain: string, purpose: SecretPurpose): string {
  const { tag } = resolveKeySource();
  const key = deriveKeyForTag(tag, purpose);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    `v1:${tag}`,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptAppSecret(envelope: string, purpose: SecretPurpose): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || (parts[0] !== "v1:totp" && parts[0] !== "v1:auth")) {
    throw new AppError("Dữ liệu mã hoá không hợp lệ.", 500, "SECRET_DECRYPT_ERROR");
  }
  const tag = parts[0] === "v1:totp" ? "totp" : "auth";
  const [, ivB64, tagB64, bodyB64] = parts;
  if (!ivB64 || !tagB64 || !bodyB64) {
    throw new AppError("Dữ liệu mã hoá không hợp lệ.", 500, "SECRET_DECRYPT_ERROR");
  }
  try {
    const key = deriveKeyForTag(tag, purpose);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(bodyB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "Không giải mã được dữ liệu bảo mật. Khoá mã hoá có thể đã thay đổi.",
      500,
      "SECRET_DECRYPT_ERROR"
    );
  }
}
