import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function encodeBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function decodeBase32(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new Error("Invalid Base32 character");
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(byteLength = 20): string {
  return encodeBase32(randomBytes(byteLength));
}

export function formatManualKey(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/** RFC 4226 HOTP (HMAC-SHA1, 6 digits by default). */
export function generateHotp(secretBase32: string, counter: number, digits = 6): string {
  const key = decodeBase32(secretBase32);
  const counterBuf = Buffer.alloc(8);
  const big = BigInt(counter);
  counterBuf.writeBigUInt64BE(big, 0);

  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const mod = 10 ** digits;
  return String(binary % mod).padStart(digits, "0");
}

/** RFC 6238 TOTP (30-second time step, 6 digits by default). */
export function generateTotp(
  secretBase32: string,
  nowMs = Date.now(),
  stepSec = 30,
  digits = 6
): string {
  const step = Math.floor(nowMs / 1000 / stepSec);
  return generateHotp(secretBase32, step, digits);
}

export function verifyTotp(
  secretBase32: string,
  rawCode: string,
  opts?: {
    nowMs?: number;
    stepSec?: number;
    digits?: number;
    window?: number;
    lastAcceptedStep?: number | null;
  }
): { valid: boolean; step?: number } {
  const stepSec = opts?.stepSec ?? 30;
  const digits = opts?.digits ?? 6;
  const window = opts?.window ?? 1;
  const nowMs = opts?.nowMs ?? Date.now();

  const cleaned = rawCode.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(cleaned) || cleaned.length !== digits) {
    return { valid: false };
  }

  const currentStep = Math.floor(nowMs / 1000 / stepSec);
  const candidateBuf = Buffer.from(cleaned, "utf8");

  for (let delta = -window; delta <= window; delta++) {
    const step = currentStep + delta;
    if (step < 0) continue;
    if (
      opts?.lastAcceptedStep !== null &&
      opts?.lastAcceptedStep !== undefined &&
      step <= opts.lastAcceptedStep
    ) {
      continue;
    }
    const expected = generateHotp(secretBase32, step, digits);
    const expectedBuf = Buffer.from(expected, "utf8");
    if (expectedBuf.length === candidateBuf.length && timingSafeEqual(expectedBuf, candidateBuf)) {
      return { valid: true, step };
    }
  }

  return { valid: false };
}

export function buildOtpauthUri(opts: {
  issuer: string;
  accountName: string;
  secret: string;
}): string {
  const issuer = opts.issuer.trim() || "EngClass";
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(opts.accountName)}`;
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export interface StoredBackupCode {
  salt: string;
  hash: string;
  usedAt: string | null;
}

export function normalizeBackupCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    let raw = "";
    for (let j = 0; j < 8; j++) {
      raw += BACKUP_ALPHABET[bytes[j]! % BACKUP_ALPHABET.length];
    }
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

export function hashBackupCodes(plainCodes: string[]): StoredBackupCode[] {
  return plainCodes.map((code) => {
    const salt = randomBytes(16).toString("hex");
    const norm = normalizeBackupCode(code);
    const hash = scryptSync(norm, salt, 32).toString("hex");
    return { salt, hash, usedAt: null };
  });
}

export function findMatchingBackupCodeIndex(
  rawCode: string,
  stored: StoredBackupCode[]
): number {
  const norm = normalizeBackupCode(rawCode);
  if (norm.length < 6) return -1;

  for (let i = 0; i < stored.length; i++) {
    const entry = stored[i]!;
    if (entry.usedAt) continue;
    const expectedBuf = Buffer.from(entry.hash, "hex");
    const actualBuf = scryptSync(norm, entry.salt, 32);
    if (expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf)) {
      return i;
    }
  }
  return -1;
}
