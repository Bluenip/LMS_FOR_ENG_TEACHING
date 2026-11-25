import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { transferOwnership } from "@/server/adminService";
import { createClass, deleteClass, getClassDetail } from "@/server/classService";
import {
  addLessonsToClass,
  createLesson,
  createLessonItem,
  deleteLessonEverywhere,
  listClassLessons,
  listLibraryLessons,
  removeLessonFromClass,
  setLessonClasses,
  updateLesson,
} from "@/server/lessonService";
import { authorizeFileDownload } from "@/server/worksheetService";
import { exportAllTeacherWorksheetsZip } from "@/server/worksheetTransferService";
import { createWorksheet } from "@/server/worksheetService";

const stamp = Date.now();
const prefix = `p14-${stamp}`;
let adminId = "";
let teacherA = { id: "", role: "TEACHER" as const };
let teacherB = { id: "", role: "TEACHER" as const };
let studentInA2 = "";
let outsiderStudent = "";
let classA1 = "";
let classA2 = "";
let classB = "";
const emails: string[] = [];

async function account(tag: string, role: "TEACHER" | "STUDENT") {
  const email = `${prefix}-${tag}@test.vn`;
  emails.push(email);
  const res = await createAccount({ id: adminId, role: "ADMIN" }, { name: `P14 ${tag}`, email, role, password: "Password12345" });
  return res.user.id;
}

beforeAll(async () => {
  adminId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", deletedAt: null, isLocked: false } })).id;
  teacherA = { id: await account("ta", "TEACHER"), role: "TEACHER" };
  teacherB = { id: await account("tb", "TEACHER"), role: "TEACHER" };
  studentInA2 = await account("s1", "STUDENT");
  outsiderStudent = await account("s2", "STUDENT");
  classA1 = (await createClass(teacherA.id, { name: `${prefix} A1` })).id;
  classA2 = (await createClass(teacherA.id, { name: `${prefix} A2` })).id;
  classB = (await createClass(teacherB.id, { name: `${prefix} B` })).id;
  await prisma.enrollment.create({ data: { classId: classA2, studentId: studentInA2, status: "ACTIVE" } });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { summary: { contains: prefix } } });
  await prisma.lesson.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.class.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.worksheet.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

describe("Phase 14: lesson library shared by many classes", () => {
  it("creates once, shows in several classes, and edits propagate", async () => {
    const lesson = await createLesson(teacherA.id, { title: `${prefix} Chapter 1` }, { classId: classA1 });
    expect((await listClassLessons(classA1)).map((l) => l.id)).toContain(lesson.id);

    const res = await setLessonClasses(teacherA, lesson.id, [classA1, classA2]);
    expect(res).toEqual({ added: 1, removed: 0 });

    await updateLesson(teacherA, lesson.id, { title: `${prefix} Chapter 1 (v2)` });
    const inA2 = await listClassLessons(classA2);
    expect(inA2.find((l) => l.id === lesson.id)?.title).toBe(`${prefix} Chapter 1 (v2)`);

    // class page keeps the old `lessons` shape
    const detail = await getClassDetail(classA2);
    expect(detail.lessons.some((l) => l.id === lesson.id)).toBe(true);

    const library = await listLibraryLessons(teacherA);
    const row = library.find((l) => l.id === lesson.id);
    expect(row?.classLinks.map((c) => c.class.id).sort()).toEqual([classA1, classA2].sort());
  });

  it("blocks other teachers (IDOR) from editing, linking or reading files", async () => {
    const lesson = await createLesson(teacherA.id, { title: `${prefix} Private` });
    await expect(updateLesson(teacherB, lesson.id, { title: "hijack" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(setLessonClasses(teacherB, lesson.id, [classB])).rejects.toMatchObject({ statusCode: 403 });
    await expect(addLessonsToClass(teacherB, classB, [lesson.id])).rejects.toMatchObject({ code: "INVALID_LESSONS" });
    await expect(deleteLessonEverywhere(teacherB, lesson.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      createLessonItem(teacherB, lesson.id, { title: "x item", type: "LINK", url: "https://example.com" })
    ).rejects.toMatchObject({ statusCode: 403 });
    // the owner cannot push a lesson into someone else's class
    await expect(setLessonClasses(teacherA, lesson.id, [classB])).rejects.toMatchObject({ code: "INVALID_CLASSES" });
    expect((await listLibraryLessons(teacherB)).some((l) => l.id === lesson.id)).toBe(false);
  });

  it("serves lesson files to students of any class showing the lesson, and nobody else", async () => {
    const lesson = await createLesson(teacherA.id, { title: `${prefix} Files` });
    const fileKey = `lessons/test/${prefix}/handout.pdf`;
    await createLessonItem(teacherA, lesson.id, { title: "Handout", type: "PDF", fileKey });

    expect(await authorizeFileDownload(studentInA2, "STUDENT", fileKey)).toBe(false);
    await addLessonsToClass(teacherA, classA2, [lesson.id]);
    expect(await authorizeFileDownload(studentInA2, "STUDENT", fileKey)).toBe(true);
    expect(await authorizeFileDownload(outsiderStudent, "STUDENT", fileKey)).toBe(false);
    expect(await authorizeFileDownload(teacherA.id, "TEACHER", fileKey)).toBe(true);
    expect(await authorizeFileDownload(teacherB.id, "TEACHER", fileKey)).toBe(false);

    // removing from the class revokes the student's access; the lesson stays in the library
    await removeLessonFromClass(classA2, lesson.id);
    expect(await authorizeFileDownload(studentInA2, "STUDENT", fileKey)).toBe(false);
    expect(await prisma.lesson.findUnique({ where: { id: lesson.id } })).not.toBeNull();
  });

  it("keeps a library lesson when its first class is deleted", async () => {
    const temp = await createClass(teacherA.id, { name: `${prefix} Temp` });
    const lesson = await createLesson(teacherA.id, { title: `${prefix} Survives` }, { classId: temp.id });
    await setLessonClasses(teacherA, lesson.id, [temp.id, classA1]);
    await deleteClass(temp.id, teacherA.id);
    const after = await prisma.lesson.findUnique({ where: { id: lesson.id }, include: { classLinks: true } });
    expect(after?.classId).toBeNull();
    expect(after?.classLinks.map((l) => l.classId)).toEqual([classA1]);
  });

  it("moves lessons used only by transferred classes to the new owner", async () => {
    const onlyA2 = await createLesson(teacherA.id, { title: `${prefix} Only A2` }, { classId: classA2 });
    const both = await createLesson(teacherA.id, { title: `${prefix} Both` }, { classId: classA2 });
    await setLessonClasses(teacherA, both.id, [classA1, classA2]);

    const res = await transferOwnership(adminId, teacherA.id, { toUserId: teacherB.id, classIds: [classA2] });
    expect(res.transferredLessons).toBe(1);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: onlyA2.id } })).ownerId).toBe(teacherB.id);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: both.id } })).ownerId).toBe(teacherA.id);
  });
});

describe("Phase 14: worksheet backup of selected worksheets", () => {
  it("packs only the chosen worksheets of the caller", async () => {
    const w1 = await createWorksheet(teacherA.id, { title: `${prefix} WS 1` });
    await createWorksheet(teacherA.id, { title: `${prefix} WS 2` });
    const foreign = await createWorksheet(teacherB.id, { title: `${prefix} WS B` });

    const JSZip = (await import("jszip")).default;
    const { buffer } = await exportAllTeacherWorksheetsZip(teacherA.id, [w1.id, foreign.id]);
    const zip = await JSZip.loadAsync(buffer);
    const manifest = JSON.parse(await zip.file("backup-manifest.json")!.async("string"));
    expect(manifest.count).toBe(1);
    expect(manifest.entries[0].title).toBe(`${prefix} WS 1`);
  });
});
