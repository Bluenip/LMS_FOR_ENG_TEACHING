import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Google Drive is faked: we only check which files Pivora trashes / restores and how it reacts
// to files trashed directly in Drive.
const drive = vi.hoisted(() => ({
  trashed: new Set<string>(),
  gone: new Set<string>(),
  active: [] as Array<{ id: string; name: string; createdTime?: string; appProperties?: Record<string, string> }>,
}));
vi.mock("@/lib/drive/google-drive", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/drive/google-drive")>();
  return {
    ...real,
    trashDriveFile: vi.fn(async (_conn: string, id: string) => {
      drive.trashed.add(id);
    }),
    untrashDriveFile: vi.fn(async (_conn: string, id: string) => {
      drive.trashed.delete(id);
      return !drive.gone.has(id);
    }),
    listTrashedDriveFileIds: vi.fn(async () => [...drive.trashed]),
    listActiveAppFiles: vi.fn(async () => drive.active.filter((f) => !drive.trashed.has(f.id))),
  };
});

import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass, getClassDetail, listStudentClasses, listTeacherClasses } from "@/server/classService";
import { listStudentAssignments } from "@/server/assignmentService";
import { createLesson, createLessonItem, listClassLessons, listLibraryLessons } from "@/server/lessonService";
import { createWorksheet, listTeacherWorksheets } from "@/server/worksheetService";
import { trashDriveOrphans } from "@/server/driveService";
import {
  deleteForever,
  listTrash,
  purgeExpiredContentTrash,
  restoreFromTrash,
  syncTrashWithDrive,
  trashClass,
  trashLesson,
  trashLessonItem,
  trashWorksheet,
} from "@/server/trashService";

const stamp = Date.now();
const prefix = `p14t-${stamp}`;
const emails: string[] = [];
let adminId = "";
let teacher = { id: "", role: "TEACHER" as const };
let other = { id: "", role: "TEACHER" as const };
let classId = "";
let connId = "";

async function account(tag: string) {
  const email = `${prefix}-${tag}@test.vn`;
  emails.push(email);
  const res = await createAccount({ id: adminId, role: "ADMIN" }, { name: `T ${tag}`, email, role: "TEACHER", password: "Password12345" });
  return res.user.id;
}

/** A worksheet whose PDF lives on (fake) Google Drive. */
async function worksheetOnDrive(title: string) {
  const ws = await createWorksheet(teacher.id, { title });
  const key = `test/${prefix}/${ws.id}.pdf`;
  await prisma.worksheet.update({ where: { id: ws.id }, data: { pdfFileKey: key, pageCount: 1 } });
  const df = await prisma.driveFile.create({
    data: {
      storageKey: key,
      driveFileId: `drive-${ws.id}`,
      connectionId: connId,
      ownerId: teacher.id,
      name: "ws.pdf",
      mimeType: "application/pdf",
      kind: "WORKSHEET_PDF",
      worksheetId: ws.id,
    },
  });
  return { ws, driveFileId: df.driveFileId };
}

beforeAll(async () => {
  adminId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", deletedAt: null, isLocked: false } })).id;
  teacher = { id: await account("t"), role: "TEACHER" };
  other = { id: await account("o"), role: "TEACHER" };
  classId = (await createClass(teacher.id, { name: `${prefix} Class` })).id;
  connId = (
    await prisma.driveConnection.create({
      data: {
        scopeKey: `test:${prefix}`,
        ownerId: teacher.id,
        connectedById: teacher.id,
        email: `${prefix}@test.vn`,
        encryptedRefreshToken: "v1.dummy.dummy.dummy",
        scope: "drive.file",
        status: "ACTIVE",
      },
    })
  ).id;
});

beforeEach(() => {
  drive.trashed.clear();
  drive.gone.clear();
  drive.active = [];
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { summary: { contains: prefix } } });
  await prisma.driveFile.deleteMany({ where: { storageKey: { startsWith: `test/${prefix}` } } });
  await prisma.driveConnection.deleteMany({ where: { id: connId } });
  await prisma.worksheet.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.lesson.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.class.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

describe("Phase 14: library trash", () => {
  it("trashes a worksheet with its Drive file, restores both, and blocks other teachers", async () => {
    const { ws, driveFileId } = await worksheetOnDrive(`${prefix} WS`);

    await expect(trashWorksheet(other, ws.id)).rejects.toMatchObject({ statusCode: 403 });
    await trashWorksheet(teacher, ws.id);
    expect(drive.trashed.has(driveFileId)).toBe(true);
    expect((await listTeacherWorksheets(teacher.id)).some((w) => w.id === ws.id)).toBe(false);

    const trash = await listTrash(teacher);
    const entry = trash.find((t) => t.id === ws.id);
    expect(entry).toMatchObject({ kind: "WORKSHEET", source: "USER", daysLeft: 30 });
    expect((await listTrash(other)).some((t) => t.id === ws.id)).toBe(false);

    await expect(restoreFromTrash(other, "WORKSHEET", ws.id)).rejects.toMatchObject({ statusCode: 403 });
    const res = await restoreFromTrash(teacher, "WORKSHEET", ws.id);
    expect(res.missingFiles).toBe(0);
    expect(drive.trashed.has(driveFileId)).toBe(false);
    expect((await listTeacherWorksheets(teacher.id)).some((w) => w.id === ws.id)).toBe(true);
  });

  it("hides trashed lessons and materials from classes and the library", async () => {
    const lesson = await createLesson(teacher.id, { title: `${prefix} Lesson` }, { classId });
    const item = await createLessonItem(teacher, lesson.id, { title: "Video", type: "LINK", url: "https://example.com" });

    await trashLessonItem(teacher, lesson.id, item.id);
    expect((await listClassLessons(classId)).find((l) => l.id === lesson.id)?.items).toHaveLength(0);
    expect((await listTrash(teacher)).find((t) => t.id === item.id)).toMatchObject({
      kind: "LESSON_ITEM",
      parentTitle: `${prefix} Lesson`,
    });

    await trashLesson(teacher, lesson.id);
    expect((await listClassLessons(classId)).some((l) => l.id === lesson.id)).toBe(false);
    expect((await listLibraryLessons(teacher)).some((l) => l.id === lesson.id)).toBe(false);

    await restoreFromTrash(teacher, "LESSON", lesson.id);
    expect((await listClassLessons(classId)).some((l) => l.id === lesson.id)).toBe(true);

    await deleteForever(teacher, "LESSON_ITEM", item.id);
    expect(await prisma.lessonItem.findUnique({ where: { id: item.id } })).toBeNull();
  });

  it("puts items into Pivora's trash when their file is trashed in Google Drive, and back when restored there", async () => {
    const { ws, driveFileId } = await worksheetOnDrive(`${prefix} Drive side`);

    drive.trashed.add(driveFileId); // an admin deletes the PDF in Google Drive
    const first = await syncTrashWithDrive();
    expect(first.trashedFromDrive).toBeGreaterThanOrEqual(1);
    const entry = (await listTrash(teacher)).find((t) => t.id === ws.id);
    expect(entry?.source).toBe("DRIVE");

    drive.trashed.delete(driveFileId); // restored in Google Drive
    const second = await syncTrashWithDrive();
    expect(second.restoredFromDrive).toBeGreaterThanOrEqual(1);
    expect((await prisma.worksheet.findUniqueOrThrow({ where: { id: ws.id } })).deletedAt).toBeNull();
  });

  it("reports files that are gone from Drive and purges items after 30 days", async () => {
    const { ws, driveFileId } = await worksheetOnDrive(`${prefix} Old`);
    await trashWorksheet(teacher, ws.id);
    drive.gone.add(driveFileId);
    expect((await restoreFromTrash(teacher, "WORKSHEET", ws.id)).missingFiles).toBe(1);

    await trashWorksheet(teacher, ws.id);
    await prisma.worksheet.update({
      where: { id: ws.id },
      data: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });
    await purgeExpiredContentTrash();
    expect(await prisma.worksheet.findUnique({ where: { id: ws.id } })).toBeNull();
  });
});

describe("Phase 14: Drive orphan cleanup", () => {
  it("trashes only old Pivora files that no record points to", async () => {
    const { driveFileId: knownId } = await worksheetOnDrive(`${prefix} Known`);
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = new Date().toISOString();
    drive.active = [
      { id: knownId, name: "known.pdf", createdTime: old, appProperties: { engclassKind: "WORKSHEET_PDF" } },
      { id: `${prefix}-orphan`, name: "orphan.pdf", createdTime: old, appProperties: { engclassKind: "WORKSHEET_PDF" } },
      { id: `${prefix}-uploading`, name: "new.mp4", createdTime: fresh, appProperties: { engclassKind: "LESSON_FILE" } },
      { id: `${prefix}-foreign`, name: "not-ours.pdf", createdTime: old },
    ];

    const res = await trashDriveOrphans();
    expect(res.orphansTrashed).toBe(1);
    expect(drive.trashed.has(`${prefix}-orphan`)).toBe(true);
    expect(drive.trashed.has(knownId)).toBe(false);
    expect(drive.trashed.has(`${prefix}-uploading`)).toBe(false);
    expect(drive.trashed.has(`${prefix}-foreign`)).toBe(false);
  });
});

describe("Phase 14: class trash", () => {
  it("hides a deleted class everywhere, keeps its lessons, restores it, and purges it after 30 days", async () => {
    const cls = await createClass(teacher.id, { name: `${prefix} Trash class` });
    const studentEmail = `${prefix}-stu@test.vn`;
    emails.push(studentEmail);
    const student = (
      await createAccount({ id: adminId, role: "ADMIN" }, { name: "Stu", email: studentEmail, role: "STUDENT", password: "Password12345" })
    ).user;
    await prisma.enrollment.create({ data: { classId: cls.id, studentId: student.id, status: "ACTIVE" } });
    const ws = await createWorksheet(teacher.id, { title: `${prefix} WS in class` });
    await prisma.assignment.create({ data: { classId: cls.id, worksheetId: ws.id, title: `${prefix} asg` } });
    const lesson = await createLesson(teacher.id, { title: `${prefix} Lesson in class` }, { classId: cls.id });

    await expect(trashClass(other, cls.id)).rejects.toMatchObject({ statusCode: 403 });
    await trashClass(teacher, cls.id);

    expect((await listTeacherClasses(teacher.id)).some((c) => c.id === cls.id)).toBe(false);
    expect((await listStudentClasses(student.id)).some((c) => c.id === cls.id)).toBe(false);
    expect((await listStudentAssignments(student.id)).some((a) => a.classId === cls.id)).toBe(false);
    await expect(getClassDetail(cls.id)).rejects.toMatchObject({ statusCode: 404 });
    expect((await listTrash(teacher)).find((t) => t.id === cls.id)).toMatchObject({ kind: "CLASS", daysLeft: 30 });
    expect((await listTrash(other)).some((t) => t.id === cls.id)).toBe(false);

    await restoreFromTrash(teacher, "CLASS", cls.id);
    expect((await listTeacherClasses(teacher.id)).some((c) => c.id === cls.id)).toBe(true);
    expect((await getClassDetail(cls.id)).lessons.some((l) => l.id === lesson.id)).toBe(true);

    await trashClass(teacher, cls.id);
    await prisma.class.update({
      where: { id: cls.id },
      data: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });
    await purgeExpiredContentTrash();
    expect(await prisma.class.findUnique({ where: { id: cls.id } })).toBeNull();
    expect(await prisma.assignment.count({ where: { classId: cls.id } })).toBe(0);
    // the lesson stays in the teacher's library
    expect(await prisma.lesson.findUnique({ where: { id: lesson.id } })).not.toBeNull();
  });

  it("ignores trashed-class submissions when counting assignments or deleting worksheets, and restores both when the class is restored", async () => {
    const cls = await createClass(teacher.id, { name: `${prefix} Submitted class` });
    const studentEmail = `${prefix}-sub-stu@test.vn`;
    emails.push(studentEmail);
    const student = (
      await createAccount(
        { id: adminId, role: "ADMIN" },
        { name: "Sub Stu", email: studentEmail, role: "STUDENT", password: "Password12345" }
      )
    ).user;
    await prisma.enrollment.create({ data: { classId: cls.id, studentId: student.id, status: "ACTIVE" } });

    const { ws, driveFileId } = await worksheetOnDrive(`${prefix} Submitted WS`);
    const asg = await prisma.assignment.create({
      data: { classId: cls.id, worksheetId: ws.id, title: `${prefix} submitted asg` },
    });
    await prisma.submission.create({
      data: {
        assignmentId: asg.id,
        studentId: student.id,
        attemptNo: 1,
        status: "SUBMITTED",
        maxScore: 10,
        attemptVersion: 1,
      },
    });

    // 1. Active class with submission: shows 1 assignment and blocks trashing worksheet
    const activeRow = (await listTeacherWorksheets(teacher.id)).find((w) => w.id === ws.id);
    expect(activeRow?._count.assignments).toBe(1);
    await expect(trashWorksheet(teacher, ws.id)).rejects.toMatchObject({
      statusCode: 409,
      code: "WORKSHEET_HAS_SUBMISSIONS",
    });

    // 2. Trash the class: assignment count drops to 0 and worksheet can be trashed without wiping the trashed class's assignment
    await trashClass(teacher, cls.id);
    const afterClassTrashRow = (await listTeacherWorksheets(teacher.id)).find((w) => w.id === ws.id);
    expect(afterClassTrashRow?._count.assignments).toBe(0);

    await trashWorksheet(teacher, ws.id);
    expect(drive.trashed.has(driveFileId)).toBe(true);
    expect(await prisma.assignment.findUnique({ where: { id: asg.id } })).not.toBeNull();

    // 3. Restoring the class also restores its trashed worksheet and Drive file
    await restoreFromTrash(teacher, "CLASS", cls.id);
    const restoredWs = await prisma.worksheet.findUniqueOrThrow({ where: { id: ws.id } });
    expect(restoredWs.deletedAt).toBeNull();
    expect(drive.trashed.has(driveFileId)).toBe(false);

    // 4. Trashing both class and worksheet, then deleting the worksheet forever succeeds cleanly
    await trashClass(teacher, cls.id);
    await trashWorksheet(teacher, ws.id);
    await deleteForever(teacher, "WORKSHEET", ws.id);
    expect(await prisma.worksheet.findUnique({ where: { id: ws.id } })).toBeNull();
  });
});
