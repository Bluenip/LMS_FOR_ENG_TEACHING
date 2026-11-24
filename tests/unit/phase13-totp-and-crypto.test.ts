import { afterEach, describe, expect, it } from "vitest";
import {
  buildOtpauthUri,
  decodeBase32,
  encodeBase32,
  findMatchingBackupCodeIndex,
  generateBackupCodes,
  generateHotp,
  generateTotp,
  generateTotpSecret,
  hashBackupCodes,
  verifyTotp,
} from "@/lib/totp";
import { decryptAppSecret, encryptAppSecret } from "@/lib/crypto-secrets";
import { sanitizeAuditMeta } from "@/server/auditService";
import { parseImportRole } from "@/server/bulkImportService";

describe("Phase 13 unit: RFC 4226/6238 TOTP & backup codes", () => {
  it("encodes and decodes Base32 losslessly", () => {
    const raw = Buffer.from("12345678901234567890", "ascii");
    const encoded = encodeBase32(raw);
    expect(encoded).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(decodeBase32(encoded).equals(raw)).toBe(true);
    // Tolerates whitespace, hyphens, lowercase
    expect(decodeBase32("gezd-gnbv gy3t qojq gezd gnbv gy3t qojq").equals(raw)).toBe(true);
  });

  it("matches official RFC 4226 HOTP test vectors", () => {
    const rfcSecret = encodeBase32(Buffer.from("12345678901234567890", "ascii"));
    const expected = [
      "755224",
      "287082",
      "359152",
      "969429",
      "338314",
      "254676",
      "287922",
      "162583",
      "399871",
      "520489",
    ];
    for (let counter = 0; counter < expected.length; counter++) {
      expect(generateHotp(rfcSecret, counter, 6)).toBe(expected[counter]);
    }
  });

  it("verifies TOTP within ±1 time step and blocks replay using lastAcceptedStep", () => {
    const secret = generateTotpSecret();
    const baseMs = 1_700_000_010_000; // fixed deterministic timestamp
    const currentCode = generateTotp(secret, baseMs);
    const prevCode = generateTotp(secret, baseMs - 30_000);
    const oldCode = generateTotp(secret, baseMs - 90_000);

    const okCurrent = verifyTotp(secret, currentCode, { nowMs: baseMs });
    expect(okCurrent.valid).toBe(true);
    expect(okCurrent.step).toBe(Math.floor(baseMs / 1000 / 30));

    // Replay at same step is rejected when lastAcceptedStep is passed
    const replay = verifyTotp(secret, currentCode, {
      nowMs: baseMs,
      lastAcceptedStep: okCurrent.step,
    });
    expect(replay.valid).toBe(false);

    // ±1 drift allowed without prior step
    expect(verifyTotp(secret, prevCode, { nowMs: baseMs }).valid).toBe(true);
    // Outside ±1 window rejected
    expect(verifyTotp(secret, oldCode, { nowMs: baseMs }).valid).toBe(false);
    // Non-6-digit rejected
    expect(verifyTotp(secret, "12345", { nowMs: baseMs }).valid).toBe(false);
    expect(verifyTotp(secret, "abcdef", { nowMs: baseMs }).valid).toBe(false);
  });

  it("builds valid otpauth URI", () => {
    const uri = buildOtpauthUri({
      issuer: "EngClass",
      accountName: "admin@engclass.vn",
      secret: "JBSWY3DPEHPK3PXP",
    });
    expect(uri).toContain("otpauth://totp/EngClass:admin%40engclass.vn?");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=EngClass");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("generates, hashes, and verifies single-use backup codes without storing plaintext", () => {
    const codes = generateBackupCodes(8);
    expect(codes).toHaveLength(8);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    }

    const stored = hashBackupCodes(codes);
    const serialized = JSON.stringify(stored);
    for (const c of codes) {
      expect(serialized).not.toContain(c);
      expect(serialized).not.toContain(c.replace("-", ""));
    }

    // Matches ignoring case and hyphen
    expect(findMatchingBackupCodeIndex(codes[3]!.toLowerCase().replace("-", " "), stored)).toBe(3);
    expect(findMatchingBackupCodeIndex("ZZZZ-ZZZZ", stored)).toBe(-1);

    // Once marked used, no longer matches
    stored[3]!.usedAt = new Date().toISOString();
    expect(findMatchingBackupCodeIndex(codes[3]!, stored)).toBe(-1);
  });
});

describe("Phase 13 unit: AES-256-GCM secret encryption & key-source compatibility", () => {
  const originalTotpKey = process.env.TOTP_ENCRYPTION_KEY;
  const originalAuthSecret = process.env.AUTH_SECRET;

  afterEach(() => {
    if (originalTotpKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = originalTotpKey;
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
  });

  it("encrypts/decrypts secrets with TOTP_ENCRYPTION_KEY and detects tampering", () => {
    process.env.TOTP_ENCRYPTION_KEY = "a".repeat(48);
    const envelope = encryptAppSecret("MY_SUPER_SECRET_BASE32", "totp");
    expect(envelope.startsWith("v1:totp.")).toBe(true);
    expect(envelope).not.toContain("MY_SUPER_SECRET_BASE32");
    expect(decryptAppSecret(envelope, "totp")).toBe("MY_SUPER_SECRET_BASE32");

    // Tampered ciphertext throws
    const tampered = `${envelope.slice(0, -2)}AA`;
    expect(() => decryptAppSecret(tampered, "totp")).toThrow();

    // Wrong purpose throws (domain separation)
    expect(() => decryptAppSecret(envelope, "export")).toThrow();
  });

  it("preserves decryption of AUTH_SECRET-encrypted records after TOTP_ENCRYPTION_KEY is later configured", () => {
    delete process.env.TOTP_ENCRYPTION_KEY;
    process.env.AUTH_SECRET = "existing-production-auth-secret-32chars";

    const oldEnvelope = encryptAppSecret("LEGACY_TOTP_SECRET", "totp");
    expect(oldEnvelope.startsWith("v1:auth.")).toBe(true);

    // Later operator adds dedicated TOTP_ENCRYPTION_KEY
    process.env.TOTP_ENCRYPTION_KEY = "new-dedicated-totp-key-with-at-least-32-chars";
    expect(decryptAppSecret(oldEnvelope, "totp")).toBe("LEGACY_TOTP_SECRET");

    const newEnvelope = encryptAppSecret("NEW_TOTP_SECRET", "totp");
    expect(newEnvelope.startsWith("v1:totp.")).toBe(true);
    expect(decryptAppSecret(newEnvelope, "totp")).toBe("NEW_TOTP_SECRET");
  });
});

describe("Phase 13 unit: audit metadata sanitizer & bulk import role parser", () => {
  it("strips passwords, secrets, tokens, and hashes recursively from audit metadata", () => {
    const clean = sanitizeAuditMeta({
      email: "user@test.vn",
      password: "secret123",
      temporaryPassword: "Temp9999",
      nested: {
        ok: true,
        totpSecret: "JBSWY3DP",
        accessToken: "ya29.xxx",
        backupCodes: ["AAAA-BBBB"],
        passwordHash: "$2a$10$xxx",
      },
    }) as Record<string, unknown>;

    expect(clean.email).toBe("user@test.vn");
    expect(clean.password).toBeUndefined();
    expect(clean.temporaryPassword).toBeUndefined();
    const nested = clean.nested as Record<string, unknown>;
    expect(nested.ok).toBe(true);
    expect(nested.totpSecret).toBeUndefined();
    expect(nested.accessToken).toBeUndefined();
    expect(nested.backupCodes).toBeUndefined();
    expect(nested.passwordHash).toBeUndefined();
  });

  it("parses English and Vietnamese roles for bulk Excel import", () => {
    expect(parseImportRole("STUDENT")).toBe("STUDENT");
    expect(parseImportRole("Học sinh")).toBe("STUDENT");
    expect(parseImportRole("hs")).toBe("STUDENT");
    expect(parseImportRole("Giáo viên")).toBe("TEACHER");
    expect(parseImportRole("teacher")).toBe("TEACHER");
    expect(parseImportRole("Phụ huynh")).toBe("PARENT");
    expect(parseImportRole("Quản trị viên")).toBe("ADMIN");
    expect(parseImportRole("INVALID_ROLE")).toBeNull();
    expect(parseImportRole("")).toBeNull();
  });
});
