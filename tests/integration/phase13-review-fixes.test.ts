import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateTotp } from "@/lib/totp";
import { createAccount, deleteAccount, purgeAccount, purgeExpiredTrash } from "@/server/accountService";
import { listAuditLogs, logAudit } from "@/server/auditService";
import { previewBulkUserImport } from "@/server/bulkImportService";
import { createClass } from "@/server/classService";
import { ERROR_LOG_RETENTION_DAYS, pruneErrorLogs } from "@/server/errorLogService";
import {
  beginAdminTotpSetup,
  confirmEnableAdminTotp,
  verifyAdminTotpOrBackupCode,
} from "@/server/totpService";

/** Regression tests for issues found while reviewing Phase 13. */

const stamp = Date.now();
const prefix = `p13fix-${stamp}`;
let adminId = "";
const createdEmails: string[] = [];
const createdClassIds: string[] = [];
const connIds: string[] = [];

async function newUser(tag: string, role: "TEACHER" | "ADMIN") {
  const email = `${prefix}-${tag}@test.vn`;
  createdEmails.push(email);
  const res = await createAccount(
    { id: adminId, role: "ADMIN" },
    { name: `Fix ${tag}`, email, role, password: "Password12345" }
  );
  return { id: res.user.id, email };
}

beforeAll(async () => {
  const admin = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN", isLocked: false, deletedAt: null },
  });
  adminId = admin.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ summary: { contains: prefix } }, { targetType: "SYSTEM", summary: { contains: prefix } }] },
  });
  await prisma.driveFile.deleteMany({ where: { storageKey: { startsWith: `test/${prefix}` } } });
  if (connIds.length) await prisma.driveConnection.deleteMany({ where: { id: { in: connIds } } });
  if (createdClassIds.length) await prisma.class.deleteMany({ where: { id: { in: createdClassIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
});

describe("Purge keeps Drive files of transferred content safe", () => {
  it("blocks manual and automatic purge while the user's personal Drive serves another owner's files", async () => {
    const a = await newUser("drive-a", "TEACHER");
    const b = await newUser("drive-b", "TEACHER");
    const conn = await prisma.driveConnection.create({
      data: {
        scopeKey: `test:${prefix}`,
        ownerId: a.id,
        connectedById: a.id,
        email: a.email,
        encryptedRefreshToken: "v1.dummy.dummy.dummy",
        scope: "drive.file",
      },
    });
    connIds.push(conn.id);
    // file lives on A's Drive but belongs to B (as after an ownership transfer)
    const df = await prisma.driveFile.create({
      data: {
        storageKey: `test/${prefix}/moved.pdf`,
        driveFileId: `drive-${prefix}-moved`,
        connectionId: conn.id,
        ownerId: b.id,
        name: "moved.pdf",
        mimeType: "application/pdf",
        kind: "WORKSHEET_PDF",
      },
    });

    await deleteAccount({ id: adminId, role: "ADMIN" }, a.id, a.email);
    await expect(purgeAccount({ id: adminId, role: "ADMIN" }, a.id, a.email)).rejects.toMatchObject({
      code: "DRIVE_FILES_IN_USE",
    });

    // expired in the trash: automatic purge must skip it too
    await prisma.user.update({
      where: { id: a.id },
      data: { deletedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) },
    });
    await purgeExpiredTrash();
    expect(await prisma.user.findUnique({ where: { id: a.id } })).not.toBeNull();
    expect(await prisma.driveFile.findUnique({ where: { id: df.id } })).not.toBeNull();

    // once nothing foreign remains, the automatic purge runs and is audited (actor = system)
    await prisma.driveFile.delete({ where: { id: df.id } });
    await purgeExpiredTrash();
    expect(await prisma.user.findUnique({ where: { id: a.id } })).toBeNull();
    const logs = await listAuditLogs({ action: "USER_PURGED", q: a.email, page: 1, pageSize: 5 });
    expect(logs.items[0]).toMatchObject({ actorId: null });
    expect(logs.items[0]?.summaryEn).toContain("Automatically purged");
    expect(logs.items[0]?.meta).not.toHaveProperty("summaryEn");
    await prisma.auditLog.deleteMany({ where: { targetId: a.id } });
  });
});

describe("Audit log", () => {
  it("does not throw when the log row cannot be written", async () => {
    const res = await logAudit({
      actorId: `missing-user-${prefix}`, // violates the FK
      action: "USER_CREATED",
      targetType: "USER",
      summary: `orphan ${prefix}`,
    });
    expect(res).toBeNull();
  });
});

describe("Bulk import", () => {
  it("reports a class name shared by several classes as ambiguous", async () => {
    const t = await newUser("class-owner", "TEACHER");
    const name = `Dup ${prefix}`;
    const c1 = await createClass(t.id, { name });
    const c2 = await createClass(t.id, { name });
    createdClassIds.push(c1.id, c2.id);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Users");
    sheet.addRow(["Họ tên", "Email", "Vai trò", "Lớp", "Mật khẩu"]);
    sheet.addRow(["Ambiguous Student", `${prefix}-amb@test.vn`, "STUDENT", name, ""]);
    sheet.addRow(["Code Student", `${prefix}-code@test.vn`, "STUDENT", c1.joinCode, ""]);
    const preview = await previewBulkUserImport(Buffer.from(await wb.xlsx.writeBuffer()));

    expect(preview.rows[0]?.errors.map((e) => e.code)).toContain("CLASS_AMBIGUOUS");
    expect(preview.rows[1]?.valid).toBe(true);
  });
});

describe("2FA codes cannot be spent twice concurrently", () => {
  it("accepts the same TOTP code or backup code only once under concurrency", async () => {
    const adm = await newUser("totp", "ADMIN");
    const setup = await beginAdminTotpSetup(adm.id);
    const secret = setup.manualKey.replace(/\s+/g, "");
    const now = Date.now();
    const enabled = await confirmEnableAdminTotp(adm.id, generateTotp(secret, now));

    const later = now + 90_000; // a fresh step, newer than the one used to enable
    const code = generateTotp(secret, later);
    const totpResults = await Promise.all(
      [0, 1, 2].map(() => verifyAdminTotpOrBackupCode(adm.id, code, { nowMs: later }))
    );
    expect(totpResults.filter((r) => r.valid)).toHaveLength(1);

    const backup = enabled.backupCodes[0]!;
    const backupResults = await Promise.all(
      [0, 1, 2].map(() => verifyAdminTotpOrBackupCode(adm.id, backup))
    );
    expect(backupResults.filter((r) => r.valid)).toHaveLength(1);
    expect((await verifyAdminTotpOrBackupCode(adm.id, backup)).valid).toBe(false);
  });
});

describe("ErrorLog retention", () => {
  it("removes rows older than the retention window", async () => {
    const old = await prisma.errorLog.create({
      data: {
        source: "SERVER",
        message: `old ${prefix}`,
        createdAt: new Date(Date.now() - (ERROR_LOG_RETENTION_DAYS + 5) * 24 * 60 * 60 * 1000),
      },
    });
    const fresh = await prisma.errorLog.create({ data: { source: "SERVER", message: `fresh ${prefix}` } });
    await pruneErrorLogs();
    expect(await prisma.errorLog.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.errorLog.findUnique({ where: { id: fresh.id } })).not.toBeNull();
    await prisma.errorLog.delete({ where: { id: fresh.id } });
  });
});
