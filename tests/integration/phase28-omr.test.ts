import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import {
  confirmAndSyncOmrToGradebook,
  createOmrExamSheet,
  deleteOmrScan,
  generateOmrPdf,
  getOmrScanView,
  getOmrSheetDetail,
  listMyOmrScans,
  saveOmrScanResult,
  updateOmrScan,
  updateOmrSheet,
} from "@/server/omrService";
import { authorizeFileDownload } from "@/server/worksheetService";
import { getChildOverviewForParent } from "@/server/parentService";
import { readBubbles } from "@/lib/omr/bubble-reader";
import { warpToCanonical } from "@/lib/omr/perspective-warp";
import { encodeGrayPng } from "@/lib/omr/png";
import { studentSbd } from "@/lib/omr/sbd";
import { idMarks, marksFromValues, renderSyntheticSheet } from "@/lib/omr/synthetic";

const suffix = `p28_${Date.now()}`;
const ids = { admin: "", teacher: "", teacher2: "", stu1: "", stu2: "", parent: "", otherParent: "", class1: "", class2: "", ws: "" };
const T = (id: string) => ({ id, role: "TEACHER" as const });

async function mk(role: "TEACHER" | "STUDENT" | "PARENT", tag: string) {
  const res = await createAccount(
    { id: ids.admin, role: "ADMIN" },
    { name: `${tag} ${suffix}`, email: `${tag.toLowerCase()}_${suffix}@test.vn`, password: "password123", role }
  );
  return res.user.id;
}

/** Renders a scan of the MC_20 sheet for a student and returns { png, readings } as the browser would. */
function scanFor(sbd: string, answers: string, extra: Record<string, { value: string; ink?: number }> = {}) {
  const values: Record<string, string> = { ...idMarks(sbd) };
  answers.split("").forEach((a, i) => {
    if (a !== ".") values[`mc:${i + 1}`] = a;
  });
  const photo = renderSyntheticSheet({ template: "MC_20", marks: { ...marksFromValues(values), ...extra } });
  const flat = warpToCanonical(photo).gray;
  return { png: encodeGrayPng(flat), readings: readBubbles(flat, "MC_20").readings };
}

beforeAll(async () => {
  ids.admin = (await prisma.user.findUnique({ where: { email: "admin@engclass.vn" } }))!.id;
  ids.teacher = await mk("TEACHER", "T1");
  ids.teacher2 = await mk("TEACHER", "T2");
  ids.stu1 = await mk("STUDENT", "S1");
  ids.stu2 = await mk("STUDENT", "S2");
  ids.parent = await mk("PARENT", "P1");
  ids.otherParent = await mk("PARENT", "P2");
  await prisma.parentLink.create({ data: { parentId: ids.parent, studentId: ids.stu1, verifiedAt: new Date() } });
  ids.class1 = (await createClass(ids.teacher, { name: `OMR C1 ${suffix}` })).id;
  ids.class2 = (await createClass(ids.teacher2, { name: `OMR C2 ${suffix}` })).id;
  await prisma.enrollment.createMany({
    data: [
      { classId: ids.class1, studentId: ids.stu1, status: "ACTIVE" },
      { classId: ids.class1, studentId: ids.stu2, status: "ACTIVE" },
    ],
  });
  const ws = await prisma.worksheet.create({
    data: {
      ownerId: ids.teacher,
      title: `OMR WS ${suffix}`,
      fields: {
        create: ["B", "D", "A"].map((correct, i) => ({
          placement: "ANSWER_SHEET" as const,
          type: "MULTIPLE_CHOICE" as const,
          label: String(i + 1),
          order: i + 1,
          options: ["A", "B", "C", "D"].map((id) => ({ id, text: id.toLowerCase() })),
          answerKey: { correct },
        })),
      },
    },
  });
  ids.ws = ws.id;
});

afterAll(async () => {
  await prisma.class.deleteMany({ where: { id: { in: [ids.class1, ids.class2] } } });
  await prisma.worksheet.deleteMany({ where: { id: ids.ws } });
  await prisma.user.deleteMany({
    where: { id: { in: [ids.teacher, ids.teacher2, ids.stu1, ids.stu2, ids.parent, ids.otherParent] } },
  });
});

describe("Phase 28 integration: OMR scanning, server re-grading, file IDOR and gradebook sync", () => {
  it("builds the key from a worksheet, blocks other teachers, re-grades on the server and syncs to the gradebook", async () => {
    await expect(
      createOmrExamSheet(T(ids.teacher2), { classId: ids.class1, title: "x", template: "MC_20" })
    ).rejects.toMatchObject({ statusCode: 403 });

    const { id: sheetId } = await createOmrExamSheet(T(ids.teacher), {
      classId: ids.class1,
      title: `KT 15p ${suffix}`,
      template: "MC_20",
      worksheetId: ids.ws,
    });
    const detail = await getOmrSheetDetail(sheetId, T(ids.teacher));
    expect(detail.sheet.answerKeyByVariant).toEqual({ default: { mc: { "1": "B", "2": "D", "3": "A" }, tf: {}, sa: {} } });
    expect(detail.roster.find((r) => r.id === ids.stu1)?.sbd).toBe(studentSbd(ids.class1, ids.stu1));
    await expect(getOmrSheetDetail(sheetId, T(ids.teacher2))).rejects.toMatchObject({ statusCode: 403 });

    const pdf = await generateOmrPdf(sheetId, T(ids.teacher), { prefillStudents: true });
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");

    // Student 1: all correct. The client cannot inflate the score: it is computed server-side from readings.
    const sbd1 = studentSbd(ids.class1, ids.stu1);
    const s1 = scanFor(sbd1, "BDA");
    const tampered = s1.readings.map((r) => ({ ...r, score: 999 }));
    const saved1 = await saveOmrScanResult(sheetId, T(ids.teacher), { scanImageBuffer: s1.png, rawBubbles: tampered });
    expect(saved1.scan).toMatchObject({ studentId: ids.stu1, score: 10, maxScore: 10, needsReview: false });

    // Student 2: one faint mark on Q2 → needs review, then the teacher fixes it in one tap
    const sbd2 = studentSbd(ids.class1, ids.stu2);
    const s2 = scanFor(sbd2, "B.C", { "mc:2": { value: "D", ink: 185 } });
    const saved2 = await saveOmrScanResult(sheetId, T(ids.teacher), { scanImageBuffer: s2.png, rawBubbles: s2.readings });
    expect(saved2.scan.needsReview).toBe(true);
    expect(saved2.reviewKeys).toEqual(["mc:2"]);

    // Bad image type is rejected (magic bytes)
    await expect(
      saveOmrScanResult(sheetId, T(ids.teacher), { scanImageBuffer: Buffer.from("not an image at all"), rawBubbles: [] })
    ).rejects.toMatchObject({ code: "OMR_IMAGE_INVALID" });

    // Cannot assign a student from another class
    await expect(updateOmrScan(saved2.scan.id, T(ids.teacher), { studentId: ids.teacher2 })).rejects.toMatchObject({
      statusCode: 400,
    });
    const fixed = await updateOmrScan(saved2.scan.id, T(ids.teacher), { edits: { "mc:2": "D" } });
    expect(fixed.scan).toMatchObject({ needsReview: false, score: 6.67 });

    // Images are not visible before confirmation to students / parents; never to other teachers
    const key1 = saved1.scan.imageUrl.replace("/api/files/", "");
    expect(await authorizeFileDownload(ids.teacher, "TEACHER", key1)).toBe(true);
    expect(await authorizeFileDownload(ids.teacher2, "TEACHER", key1)).toBe(false);
    expect(await authorizeFileDownload(ids.stu1, "STUDENT", key1)).toBe(false);
    expect(await authorizeFileDownload(ids.parent, "PARENT", key1)).toBe(false);

    // Changing the key re-grades every scan
    await updateOmrSheet(sheetId, T(ids.teacher), { answerKeyByVariant: { default: { mc: { "1": "B", "2": "D", "3": "C" } } } });
    const afterKey = await getOmrSheetDetail(sheetId, T(ids.teacher));
    expect(afterKey.scans.find((s) => s.studentId === ids.stu2)?.score).toBe(10);
    expect(afterKey.scans.find((s) => s.studentId === ids.stu1)?.score).toBe(6.67);

    const sync = await confirmAndSyncOmrToGradebook(sheetId, T(ids.teacher));
    expect(sync).toMatchObject({ syncedCount: 2, skippedCount: 0 });
    const entries = await prisma.offlineGradeEntry.findMany({ where: { columnId: sync.columnId } });
    expect(Object.fromEntries(entries.map((e) => [e.studentId, e.score]))).toEqual({ [ids.stu1]: 6.67, [ids.stu2]: 10 });
    // Re-sync updates the same column instead of creating a new one
    const again = await confirmAndSyncOmrToGradebook(sheetId, T(ids.teacher));
    expect(again.columnId).toBe(sync.columnId);
    expect(await prisma.offlineGradeColumn.count({ where: { classId: ids.class1 } })).toBe(1);

    const notes = await prisma.notification.findMany({ where: { userId: { in: [ids.stu1, ids.parent] } } });
    expect(notes).toHaveLength(2); // one each, not duplicated by the re-sync

    // After confirmation: own student + verified parent can see; classmate / unlinked parent cannot
    expect(await authorizeFileDownload(ids.stu1, "STUDENT", key1)).toBe(true);
    expect(await authorizeFileDownload(ids.stu2, "STUDENT", key1)).toBe(false);
    expect(await authorizeFileDownload(ids.parent, "PARENT", key1)).toBe(true);
    expect(await authorizeFileDownload(ids.otherParent, "PARENT", key1)).toBe(false);

    const view = await getOmrScanView(saved1.scan.id, { id: ids.stu1, role: "STUDENT" });
    expect(view.expected).toBeNull();
    expect(view.perQuestion.map((q) => q.correct)).toEqual([true, true, false]);
    await expect(getOmrScanView(saved1.scan.id, { id: ids.stu2, role: "STUDENT" })).rejects.toMatchObject({ statusCode: 404 });

    const mine = await listMyOmrScans({ id: ids.parent, role: "PARENT" }, { studentId: ids.stu1 });
    expect(mine[0]?.score).toBe(6.67);
    await expect(listMyOmrScans({ id: ids.otherParent, role: "PARENT" }, { studentId: ids.stu1 })).rejects.toMatchObject({
      statusCode: 403,
    });
    const overview = await getChildOverviewForParent(ids.stu1);
    expect(overview.offlineGrades.find((g) => g.columnId === sync.columnId)?.omrScanId).toBe(saved1.scan.id);

    await expect(deleteOmrScan(saved1.scan.id, T(ids.teacher2))).rejects.toMatchObject({ statusCode: 403 });
  });

  it("uses per-variant keys from an assignment's exam variants", async () => {
    const asg = await prisma.assignment.create({
      data: { classId: ids.class1, worksheetId: ids.ws, title: `Variant ${suffix}` },
    });
    await prisma.examVariant.create({
      data: {
        assignmentId: asg.id,
        code: "101",
        questionOrder: [],
        optionOrder: {},
      },
    });
    const all = await prisma.field.findMany({ where: { worksheetId: ids.ws }, orderBy: { order: "asc" } });
    await prisma.examVariant.create({
      data: {
        assignmentId: asg.id,
        code: "102",
        questionOrder: [all[2]!.id, all[0]!.id, all[1]!.id],
        optionOrder: { [all[2]!.id]: ["D", "C", "B", "A"] },
      },
    });
    const { id } = await createOmrExamSheet(T(ids.teacher), {
      classId: ids.class1,
      title: "variants",
      template: "MC_20",
      assignmentId: asg.id,
    });
    const d = await getOmrSheetDetail(id, T(ids.teacher));
    const keys = d.sheet.answerKeyByVariant as Record<string, { mc: Record<string, string> }>;
    expect(keys["101"]!.mc).toEqual({ "1": "B", "2": "D", "3": "A" });
    // Q1 of variant 102 is the original Q3 (correct "A") whose options are reversed → "D"
    expect(keys["102"]!.mc).toEqual({ "1": "D", "2": "B", "3": "D" });
  });
});
