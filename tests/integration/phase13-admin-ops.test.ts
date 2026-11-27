import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateTotp } from "@/lib/totp";
import {
  createAccount,
  deleteAccount,
  purgeAccount,
  resetPasswordFor,
  restoreAccount,
} from "@/server/accountService";
import {
  adminUpdateUser,
  getUserOwnedContent,
  transferOwnership,
} from "@/server/adminService";
import { listAuditLogs } from "@/server/auditService";
import {
  claimBulkImportCredentialsExcel,
  commitBulkUserImport,
  generateBulkImportTemplate,
  previewBulkUserImport,
} from "@/server/bulkImportService";
import { createClass, deleteClass, updateClass } from "@/server/classService";
import { createWorksheet, deleteWorksheet } from "@/server/worksheetService";
import { createAssignmentsForClasses, updateAssignment } from "@/server/assignmentService";
import {
  beginAdminTotpSetup,
  confirmEnableAdminTotp,
  disableAdminTotp,
  getAdminTotpStatus,
  regenerateAdminBackupCodes,
  verifyAdminTotpOrBackupCode,
} from "@/server/totpService";
import { listRecentErrors, recordError } from "@/server/errorLogService";

const stamp = Date.now();
const prefix = `p13-${stamp}`;

let adminId = "";
let secondAdminId = "";
let teacherAId = "";
let teacherBId = "";
let trashedTeacherId = "";
let tempClass1Id = "";
let tempClass2Id = "";
let tempWs1Id = "";
let tempWs2Id = "";
let tempAsgId = "";
let tempDriveConnId = "";
let tempDriveFileId = "";

const createdUserEmails: string[] = [];
const createdClassIds: string[] = [];
const createdWorksheetIds: string[] = [];
const createdErrorIds: string[] = [];

async function buildBulkExcelBuffer(
  rows: Array<[string, string, string, string, string]>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Users");
  sheet.addRow(["Họ tên", "Email", "Vai trò", "Lớp", "Mật khẩu"]);
  for (const r of rows) {
    sheet.addRow(r);
  }
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

beforeAll(async () => {
  const admin = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN", isLocked: false, deletedAt: null },
  });
  adminId = admin.id;

  const adm2Email = `${prefix}-adm2@test.vn`;
  const tAEmail = `${prefix}-ta@test.vn`;
  const tBEmail = `${prefix}-tb@test.vn`;
  const tTrashEmail = `${prefix}-ttrash@test.vn`;
  createdUserEmails.push(adm2Email, tAEmail, tBEmail, tTrashEmail);

  const adm2 = await createAccount(
    { id: adminId, role: "ADMIN" },
    { name: "Phase13 Admin 2", email: adm2Email, role: "ADMIN", password: "AdminPassword123!" }
  );
  secondAdminId = adm2.user.id;

  const tA = await createAccount(
    { id: adminId, role: "ADMIN" },
    { name: "Teacher Alpha", email: tAEmail, role: "TEACHER", password: "TeacherPassword1" }
  );
  teacherAId = tA.user.id;

  const tB = await createAccount(
    { id: adminId, role: "ADMIN" },
    { name: "Teacher Beta", email: tBEmail, role: "TEACHER", password: "TeacherPassword1" }
  );
  teacherBId = tB.user.id;

  const tTrash = await createAccount(
    { id: adminId, role: "ADMIN" },
    { name: "Trashed Teacher", email: tTrashEmail, role: "TEACHER", password: "TeacherPassword1" }
  );
  trashedTeacherId = tTrash.user.id;
  await deleteAccount({ id: adminId, role: "ADMIN" }, trashedTeacherId, tTrashEmail);

  // Teacher A owns 2 classes, 2 worksheets, 1 assignment, and 1 DriveFile
  const cls1 = await createClass(teacherAId, { name: `P13 Class 1 ${stamp}` });
  const cls2 = await createClass(teacherAId, { name: `P13 Class 2 ${stamp}` });
  tempClass1Id = cls1.id;
  tempClass2Id = cls2.id;
  createdClassIds.push(cls1.id, cls2.id);

  const ws1 = await createWorksheet(teacherAId, { title: `P13 Worksheet 1 ${stamp}` });
  const ws2 = await createWorksheet(teacherAId, { title: `P13 Worksheet 2 ${stamp}` });
  tempWs1Id = ws1.id;
  tempWs2Id = ws2.id;
  createdWorksheetIds.push(ws1.id, ws2.id);

  const [asg] = await createAssignmentsForClasses(teacherAId, false, {
    worksheetId: ws1.id,
    classIds: [cls1.id],
    title: `P13 Assignment ${stamp}`,
    maxAttempts: 1,
    shuffle: false,
    showResult: "AFTER_SUBMIT",
    showAnswerKey: false,
    allowLate: false,
    showLeaderboard: "OFF",
    leaderboardAnon: false,
    leaderboardScoreRule: "BEST",
    proctorMode: "OFF",
    violationAction: "WARN",
    maxViolations: 3,
    requireFullscreen: false,
    blockCopyPaste: false,
    shareProctorWithParent: false,
    requireCamera: false,
    cameraEnforce: false,
    cameraSnapshots: false,
    audioBlockPause: false,
    audioBlockSeek: false,
  });
  tempAsgId = asg!.id;

  // Create a synthetic DriveConnection + DriveFile owned by Teacher A linked to ws1
  const conn = await prisma.driveConnection.create({
    data: {
      scopeKey: `test:${prefix}`,
      ownerId: teacherAId,
      connectedById: teacherAId,
      email: tAEmail,
      encryptedRefreshToken: "v1.dummy.dummy.dummy",
      scope: "drive.file",
    },
  });
  tempDriveConnId = conn.id;
  const df = await prisma.driveFile.create({
    data: {
      storageKey: `test/${prefix}/ws1.pdf`,
      driveFileId: `drive-${prefix}-ws1`,
      connectionId: conn.id,
      ownerId: teacherAId,
      name: "ws1.pdf",
      mimeType: "application/pdf",
      kind: "WORKSHEET_PDF",
      worksheetId: ws1.id,
      classId: cls1.id,
    },
  });
  tempDriveFileId = df.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { summary: { contains: prefix } },
        { summary: { contains: String(stamp) } },
        { actorId: { in: [secondAdminId, teacherAId, teacherBId].filter(Boolean) } },
      ],
    },
  });
  if (createdErrorIds.length > 0) {
    await prisma.errorLog.deleteMany({ where: { id: { in: createdErrorIds } } });
  }
  if (tempDriveFileId) {
    await prisma.driveFile.deleteMany({ where: { id: tempDriveFileId } });
  }
  if (tempDriveConnId) {
    await prisma.driveConnection.deleteMany({ where: { id: tempDriveConnId } });
  }
  if (createdClassIds.length > 0) {
    await prisma.class.deleteMany({ where: { id: { in: createdClassIds } } });
  }
  if (createdWorksheetIds.length > 0) {
    await prisma.worksheet.deleteMany({ where: { id: { in: createdWorksheetIds } } });
  }
  if (createdUserEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
  }
});

describe("Phase 13.1: Ownership transfer & demoting teacher", () => {
  it("blocks demoting teacher with content, excludes trashed recipients, transfers selective & all items, and then allows demoting", async () => {
    // 1. Demoting teacher A while owning classes/worksheets fails with ROLE_HAS_CONTENT
    await expect(
      adminUpdateUser(teacherAId, adminId, { role: "STUDENT" })
    ).rejects.toMatchObject({ statusCode: 400, code: "ROLE_HAS_CONTENT" });

    // 2. Owned content excludes trashed teachers from eligibleRecipients
    const owned = await getUserOwnedContent(teacherAId);
    expect(owned.classes).toHaveLength(2);
    expect(owned.worksheets).toHaveLength(2);
    expect(owned.eligibleRecipients.some((r) => r.id === teacherBId)).toBe(true);
    expect(owned.eligibleRecipients.some((r) => r.id === trashedTeacherId)).toBe(false);

    // 3. Rejects self-transfer, trashed recipient, and empty selection
    await expect(
      transferOwnership(adminId, teacherAId, { toUserId: teacherAId, transferAll: true })
    ).rejects.toMatchObject({ statusCode: 400, code: "SAME_OWNER" });

    await expect(
      transferOwnership(adminId, teacherAId, { toUserId: trashedTeacherId, transferAll: true })
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_RECIPIENT" });

    await expect(
      transferOwnership(adminId, teacherAId, { toUserId: teacherBId, classIds: [], worksheetIds: [] })
    ).rejects.toMatchObject({ statusCode: 400, code: "NOTHING_TO_TRANSFER" });

    // 4. Selective transfer: move class 1 + worksheet 1
    const partial = await transferOwnership(adminId, teacherAId, {
      toUserId: teacherBId,
      classIds: [tempClass1Id],
      worksheetIds: [tempWs1Id],
    });
    expect(partial.transferredClasses).toBe(1);
    expect(partial.transferredWorksheets).toBe(1);
    expect(partial.driveFilesUpdated).toBe(1);

    const movedDriveFile = await prisma.driveFile.findUniqueOrThrow({
      where: { id: tempDriveFileId },
    });
    expect(movedDriveFile.ownerId).toBe(teacherBId);
    expect(movedDriveFile.driveFileId).toBe(`drive-${prefix}-ws1`); // unchanged on Drive

    const movedAsg = await prisma.assignment.findUniqueOrThrow({
      where: { id: tempAsgId },
      include: { class: true },
    });
    expect(movedAsg.class.teacherId).toBe(teacherBId);

    // 5. Transfer remaining all items from A to B
    const rest = await transferOwnership(adminId, teacherAId, {
      toUserId: teacherBId,
      transferAll: true,
    });
    expect(rest.transferredClasses).toBe(1);
    expect(rest.transferredWorksheets).toBe(1);

    // 6. Now demoting Teacher A to STUDENT succeeds!
    const demoted = await adminUpdateUser(teacherAId, adminId, { role: "STUDENT" });
    expect(demoted.role).toBe("STUDENT");

    // Audit log recorded OWNERSHIP_TRANSFERRED & USER_ROLE_CHANGED
    const auditTransfer = await listAuditLogs({
      action: "OWNERSHIP_TRANSFERRED",
      q: `${prefix}-ta@test.vn`,
    });
    expect(auditTransfer.total).toBeGreaterThanOrEqual(2);
  });
});

describe("Phase 13.2: Audit log covers all required actions and never stores secrets", () => {
  it("records account lifecycle, lock/unlock, password reset, assignment update, class archive/delete, worksheet delete", async () => {
    const lifecycleEmail = `${prefix}-life@test.vn`;
    createdUserEmails.push(lifecycleEmail);

    const created = await createAccount(
      { id: adminId, role: "ADMIN" },
      { name: "Lifecycle Student", email: lifecycleEmail, role: "STUDENT" }
    );
    const uid = created.user.id;
    const tempPw1 = created.temporaryPassword!;

    await adminUpdateUser(uid, adminId, { isLocked: true });
    await adminUpdateUser(uid, adminId, { isLocked: false });
    const resetRes = await resetPasswordFor({ id: adminId, role: "ADMIN" }, uid);
    const tempPw2 = resetRes.temporaryPassword;

    await deleteAccount({ id: adminId, role: "ADMIN" }, uid, lifecycleEmail);
    await restoreAccount({ id: adminId, role: "ADMIN" }, uid);
    await deleteAccount({ id: adminId, role: "ADMIN" }, uid, lifecycleEmail);
    await purgeAccount({ id: adminId, role: "ADMIN" }, uid, lifecycleEmail);

    // Assignment update
    await updateAssignment(
      tempAsgId,
      {
        title: `P13 Assignment Updated ${stamp}`,
        maxAttempts: 3,
        shuffle: false,
        showResult: "AFTER_SUBMIT",
        showAnswerKey: false,
        allowLate: true,
        showLeaderboard: "OFF",
        leaderboardAnon: false,
        leaderboardScoreRule: "BEST",
        proctorMode: "OFF",
        violationAction: "WARN",
        maxViolations: 3,
        requireFullscreen: false,
        blockCopyPaste: false,
        shareProctorWithParent: false,
        requireCamera: false,
        cameraEnforce: false,
        cameraSnapshots: false,
        audioBlockPause: false,
        audioBlockSeek: false,
        oneQuestionPerPage: false,
      },
      teacherBId
    );

    // Class archive, unarchive, delete (on tempClass2)
    await updateClass(tempClass2Id, { archived: true }, teacherBId);
    await updateClass(tempClass2Id, { archived: false }, teacherBId);
    await deleteClass(tempClass2Id, teacherBId);

    // Worksheet delete (on tempWs2 which has 0 submissions)
    await deleteWorksheet(tempWs2Id, teacherBId);

    const requiredActions = [
      "USER_CREATED",
      "USER_LOCKED",
      "USER_UNLOCKED",
      "USER_PASSWORD_RESET",
      "USER_TRASHED",
      "USER_RESTORED",
      "USER_PURGED",
      "OWNERSHIP_TRANSFERRED",
      "USER_ROLE_CHANGED",
      "ASSIGNMENT_UPDATED",
      "CLASS_ARCHIVED",
      "CLASS_UNARCHIVED",
      "CLASS_DELETED",
      "WORKSHEET_DELETED",
    ] as const;

    for (const act of requiredActions) {
      const res = await listAuditLogs({ action: act, page: 1, pageSize: 5 });
      expect(res.total, `Expected audit log for ${act}`).toBeGreaterThanOrEqual(1);
    }

    // Verify neither temporary password ever appears in any AuditLog entry
    const recent = await listAuditLogs({ page: 1, pageSize: 50 });
    const dump = JSON.stringify(recent.items);
    expect(dump).not.toContain(tempPw1);
    expect(dump).not.toContain(tempPw2);

    // Pagination check
    const page1 = await listAuditLogs({ page: 1, pageSize: 3 });
    const page2 = await listAuditLogs({ page: 2, pageSize: 3 });
    expect(page1.items).toHaveLength(3);
    expect(page2.items.length).toBeGreaterThan(0);
    expect(page1.items[0]!.id).not.toBe(page2.items[0]!.id);
  });
});

describe("Phase 13.3: Bulk Excel import (30 valid + 3 invalid rows + one-time password download)", () => {
  it("generates template, reports exact 3 invalid row numbers out of 33, creates 30 accounts, and enforces one-time credentials download", async () => {
    const templateBuf = await generateBulkImportTemplate();
    expect(templateBuf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);

    const rows: Array<[string, string, string, string, string]> = [];
    const expectedValidEmails: string[] = [];

    // Build 33 data rows (Excel rows 2..34): 30 valid + 3 invalid at rows 5, 12, 25
    let validIdx = 0;
    for (let excelRow = 2; excelRow <= 34; excelRow++) {
      if (excelRow === 5) {
        // Error 1 (Row 5): duplicate existing email
        rows.push(["Duplicate User", "admin@engclass.vn", "STUDENT", "", ""]);
      } else if (excelRow === 12) {
        // Error 2 (Row 12): email currently in the trash
        rows.push(["Trashed Email User", `${prefix}-ttrash@test.vn`, "TEACHER", "", ""]);
      } else if (excelRow === 25) {
        // Error 3 (Row 25): invalid role
        rows.push(["Bad Role User", `${prefix}-badrole@test.vn`, "SUPERHERO", "", ""]);
      } else {
        validIdx++;
        const email = `${prefix}-bulk-${validIdx}@test.vn`;
        expectedValidEmails.push(email);
        createdUserEmails.push(email);
        const isTeacher = validIdx % 10 === 0;
        const customPw = validIdx <= 5 ? "CustomPass99" : "";
        const classCode = !isTeacher && validIdx <= 10 ? "ENG12A" : "";
        rows.push([
          `Bulk User ${validIdx}`,
          email,
          isTeacher ? "Giáo viên" : "STUDENT",
          classCode,
          customPw,
        ]);
      }
    }

    const excelBuf = await buildBulkExcelBuffer(rows);

    // 1. Preview reports exact counts and exact row numbers 5, 12, 25
    const preview = await previewBulkUserImport(excelBuf);
    expect(preview.totalRows).toBe(33);
    expect(preview.validCount).toBe(30);
    expect(preview.errorCount).toBe(3);

    const errRows = preview.rows.filter((r) => !r.valid);
    expect(errRows.map((r) => r.rowNumber)).toEqual([5, 12, 25]);
    expect(errRows[0]!.errors.some((e) => e.code === "EMAIL_EXISTS")).toBe(true);
    expect(errRows[1]!.errors.some((e) => e.code === "EMAIL_IN_TRASH")).toBe(true);
    expect(errRows[2]!.errors.some((e) => e.code === "INVALID_ROLE")).toBe(true);

    // 2. Commit creates 30 users (25 with auto-generated temp passwords, 5 custom)
    const commit = await commitBulkUserImport({ id: adminId, role: "ADMIN" }, excelBuf);
    expect(commit.createdCount).toBe(30);
    expect(commit.skippedErrorCount).toBe(3);
    expect(commit.generatedPasswordCount).toBe(25);
    expect(commit.enrolledCount).toBe(9); // validIdx 1..10 minus validIdx 10 (teacher)
    expect(commit.credentialsExportId).toBeTruthy();

    // Verify DB state
    const createdCountInDb = await prisma.user.count({
      where: { email: { in: expectedValidEmails } },
    });
    expect(createdCountInDb).toBe(30);

    // 3. IDOR: another admin CANNOT download the creator's one-time export
    await expect(
      claimBulkImportCredentialsExcel({ id: secondAdminId, role: "ADMIN" }, commit.credentialsExportId!)
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    // Non-admin CANNOT download
    await expect(
      claimBulkImportCredentialsExcel({ id: teacherBId, role: "TEACHER" }, commit.credentialsExportId!)
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    // 4. Creator downloads once -> valid Excel with 25 temporary passwords
    const credsBuf = await claimBulkImportCredentialsExcel(
      { id: adminId, role: "ADMIN" },
      commit.credentialsExportId!
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(credsBuf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const sheet = wb.worksheets[0]!;
    expect(sheet.rowCount).toBe(26); // 1 header + 25 rows

    // Payload wiped in DB
    const expRow = await prisma.oneTimeExport.findUniqueOrThrow({
      where: { id: commit.credentialsExportId! },
    });
    expect(expRow.encryptedPayload).toBe("");
    expect(expRow.downloadedAt).toBeInstanceOf(Date);

    // 5. Second download attempt fails with 410 Gone
    await expect(
      claimBulkImportCredentialsExcel({ id: adminId, role: "ADMIN" }, commit.credentialsExportId!)
    ).rejects.toMatchObject({ statusCode: 410, code: "EXPORT_ALREADY_USED" });
  });
});

describe("Phase 13.4: Admin 2FA (TOTP) setup, login verification, backup codes & disable", () => {
  it("blocks non-admins, encrypts TOTP secret, verifies 6-digit + backup codes, and logs audit events", async () => {
    // Student (non-admin / non-teacher) rejected
    const student = await prisma.user.findFirstOrThrow({ where: { role: "STUDENT", deletedAt: null } });
    await expect(beginAdminTotpSetup(student.id)).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });

    const initialStatus = await getAdminTotpStatus(secondAdminId);
    expect(initialStatus.enabled).toBe(false);

    // Setup
    const setup = await beginAdminTotpSetup(secondAdminId);
    expect(setup.qrDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    const rawSecret = setup.manualKey.replace(/\s+/g, "");

    // DB stores encrypted secret, never plaintext
    const dbRowAfterSetup = await prisma.user.findUniqueOrThrow({ where: { id: secondAdminId } });
    expect(dbRowAfterSetup.totpEnabled).toBe(false);
    expect(dbRowAfterSetup.totpSecretEncrypted).toBeTruthy();
    expect(dbRowAfterSetup.totpSecretEncrypted).not.toContain(rawSecret);

    // Wrong code fails enable
    await expect(confirmEnableAdminTotp(secondAdminId, "000000")).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_TOTP_CODE",
    });

    // Valid code enables 2FA and returns 8 backup codes
    const now = Date.now();
    const enableCode = generateTotp(rawSecret, now);
    const enabled = await confirmEnableAdminTotp(secondAdminId, enableCode);
    expect(enabled.enabled).toBe(true);
    expect(enabled.backupCodes).toHaveLength(8);

    // Backup codes are hashed in DB (never plaintext)
    const dbEnabled = await prisma.user.findUniqueOrThrow({ where: { id: secondAdminId } });
    expect(JSON.stringify(dbEnabled.totpBackupCodes)).not.toContain(enabled.backupCodes[0]!);

    // Replaying exact same TOTP step is rejected
    const replay = await verifyAdminTotpOrBackupCode(secondAdminId, enableCode, { nowMs: now });
    expect(replay.valid).toBe(false);

    // Next 30s step TOTP succeeds
    const nextCode = generateTotp(rawSecret, now + 30_000);
    const okNext = await verifyAdminTotpOrBackupCode(secondAdminId, nextCode, {
      nowMs: now + 30_000,
    });
    expect(okNext.valid).toBe(true);
    expect(okNext.usedBackupCode).toBe(false);

    // Backup code succeeds once and fails on second use
    const bc0 = enabled.backupCodes[0]!;
    const okBackup = await verifyAdminTotpOrBackupCode(secondAdminId, bc0);
    expect(okBackup.valid).toBe(true);
    expect(okBackup.usedBackupCode).toBe(true);

    const replayBackup = await verifyAdminTotpOrBackupCode(secondAdminId, bc0);
    expect(replayBackup.valid).toBe(false);

    const midStatus = await getAdminTotpStatus(secondAdminId);
    expect(midStatus.enabled).toBe(true);
    expect(midStatus.remainingBackupCodes).toBe(7);

    // Regenerate backup codes works with password + backup code
    const regen = await regenerateAdminBackupCodes(
      secondAdminId,
      "AdminPassword123!",
      enabled.backupCodes[1]!
    );
    expect(regen.backupCodes).toHaveLength(8);
    expect((await getAdminTotpStatus(secondAdminId)).remainingBackupCodes).toBe(8);

    // Disable requires valid password + code
    await expect(
      disableAdminTotp(secondAdminId, "WrongPassword!", regen.backupCodes[0]!)
    ).rejects.toMatchObject({ statusCode: 400, code: "WRONG_PASSWORD" });

    const disabled = await disableAdminTotp(
      secondAdminId,
      "AdminPassword123!",
      regen.backupCodes[0]!
    );
    expect(disabled.enabled).toBe(false);
    expect((await getAdminTotpStatus(secondAdminId)).enabled).toBe(false);
  });
});

describe("Phase 13.5: ErrorLog persistence & listing", () => {
  it("records server and client errors, sanitizes meta, and lists up to 100 latest errors", async () => {
    const srv = await recordError({
      source: "SERVER",
      level: "ERROR",
      message: `P13 Server Test Error ${stamp}`,
      stack: "Error: boom\n  at test.ts:1:1",
      path: "/api/test",
      method: "POST",
      statusCode: 500,
      userId: adminId,
      meta: { safe: "yes", password: "must-not-be-logged", token: "secret-tok" },
    });
    const cli = await recordError({
      source: "CLIENT",
      level: "ERROR",
      message: `P13 Client Test Error ${stamp}`,
      path: "/admin",
      userId: adminId,
    });
    if (srv?.id) createdErrorIds.push(srv.id);
    if (cli?.id) createdErrorIds.push(cli.id);

    const list = await listRecentErrors({ limit: 100 });
    expect(list.items.length).toBeLessThanOrEqual(100);
    const foundSrv = list.items.find((e) => e.id === srv?.id);
    expect(foundSrv).toBeTruthy();
    expect(foundSrv!.source).toBe("SERVER");
    expect((foundSrv!.meta as Record<string, unknown>).safe).toBe("yes");
    expect((foundSrv!.meta as Record<string, unknown>).password).toBeUndefined();
    expect((foundSrv!.meta as Record<string, unknown>).token).toBeUndefined();

    const clientOnly = await listRecentErrors({ source: "CLIENT", limit: 100 });
    expect(clientOnly.items.every((e) => e.source === "CLIENT")).toBe(true);
    expect(clientOnly.items.some((e) => e.id === cli?.id)).toBe(true);
  });
});
