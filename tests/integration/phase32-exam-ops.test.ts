import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import { createLeaveRequest, listUpcomingSessionsForChild, reviewLeaveRequest } from "@/server/leaveRequestService";
import { setGradebookLock } from "@/server/termService";
import { createOfflineGradeColumn } from "@/server/offlineGradeService";
import { saveSingleFieldGrade } from "@/server/submissionService";
import { buildCalendarFeed, revokeCalendarToken, rotateCalendarToken } from "@/server/calendarFeedService";
import { grantEmergencyExtraTime, unlockForDeviceSwitch } from "@/server/liveRescueService";
import { importStandardQuestions } from "@/server/standardImportService";
import { getActiveBanner, isMaintenanceMode, saveBanner } from "@/server/adminSystemOpsService";

const suffix = `p32_${Date.now()}`;
const ids = { admin: "", teacher: "", s1: "", parent: "", parent2: "", class1: "", ws: "", f1: "", session: "", asg: "" };
const T = () => ({ id: ids.teacher, role: "TEACHER" as const });

async function mk(role: "TEACHER" | "STUDENT" | "PARENT", tag: string) {
  const res = await createAccount(
    { id: ids.admin, role: "ADMIN" },
    { name: `${tag} ${suffix}`, email: `${tag.toLowerCase()}_${suffix}@test.vn`, password: "password123", role }
  );
  return res.user.id;
}

beforeAll(async () => {
  ids.admin = (await prisma.user.findUnique({ where: { email: "admin@engclass.vn" } }))!.id;
  ids.teacher = await mk("TEACHER", "T");
  ids.s1 = await mk("STUDENT", "S");
  ids.parent = await mk("PARENT", "P");
  ids.parent2 = await mk("PARENT", "P2");
  await prisma.parentLink.create({ data: { parentId: ids.parent, studentId: ids.s1, verifiedAt: new Date() } });
  ids.class1 = (await createClass(ids.teacher, { name: `C ${suffix}` })).id;
  await prisma.enrollment.create({ data: { classId: ids.class1, studentId: ids.s1, status: "ACTIVE" } });
  ids.session = (
    await prisma.classSession.create({
      data: { classId: ids.class1, title: "Buổi 9", startsAt: new Date(Date.now() + 2 * 86_400_000), endsAt: new Date(Date.now() + 2 * 86_400_000 + 5_400_000) },
    })
  ).id;
  const ws = await prisma.worksheet.create({
    data: {
      ownerId: ids.teacher,
      title: `WS ${suffix}`,
      fields: { create: [{ placement: "ANSWER_SHEET", type: "ESSAY", label: "1", order: 1, points: 2, answerKey: {} }] },
    },
    include: { fields: true },
  });
  ids.ws = ws.id;
  ids.f1 = ws.fields[0]!.id;
  ids.asg = (
    await prisma.assignment.create({
      data: { classId: ids.class1, worksheetId: ws.id, title: `Exam ${suffix}`, timeLimitMin: 30, dueAt: new Date(Date.now() + 86_400_000) },
    })
  ).id;
});

afterAll(async () => {
  await saveBanner(ids.admin, { message: "", level: "INFO", maintenanceMode: false, active: false });
  await prisma.class.deleteMany({ where: { id: ids.class1 } });
  await prisma.worksheet.deleteMany({ where: { id: ids.ws } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.teacher, ids.s1, ids.parent, ids.parent2] } } });
});

describe("Phase 32 integration", () => {
  it("leave request: only verified parents, approval writes EXCUSED attendance in one go", async () => {
    await expect(listUpcomingSessionsForChild(ids.parent2, ids.s1)).rejects.toMatchObject({ statusCode: 403 });
    const sessions = await listUpcomingSessionsForChild(ids.parent, ids.s1);
    expect(sessions.map((s) => s.id)).toContain(ids.session);
    const { id } = await createLeaveRequest(ids.parent, { studentId: ids.s1, sessionId: ids.session, reason: "Bị sốt" });
    await expect(createLeaveRequest(ids.parent, { studentId: ids.s1, sessionId: ids.session, reason: "lại" })).rejects.toMatchObject({ statusCode: 409 });
    await reviewLeaveRequest(id, ids.class1, T(), { status: "APPROVED" });
    const att = await prisma.attendanceRecord.findUnique({ where: { sessionId_studentId: { sessionId: ids.session, studentId: ids.s1 } } });
    expect(att).toMatchObject({ status: "EXCUSED" });
    expect(att!.note).toContain("Bị sốt");
    await expect(reviewLeaveRequest(id, ids.class1, T(), { status: "REJECTED" })).rejects.toMatchObject({ statusCode: 409 });
    expect(await prisma.notification.count({ where: { userId: ids.parent } })).toBeGreaterThan(0);
  });

  it("locked gradebook refuses manual and offline grade changes until an admin unlocks", async () => {
    const sub = await prisma.submission.create({
      data: { assignmentId: ids.asg, studentId: ids.s1, attemptNo: 1, status: "SUBMITTED", submittedAt: new Date(), maxScore: 2, answers: { create: { fieldId: ids.f1, value: "bài" } } },
    });
    await setGradebookLock(ids.class1, T(), true);
    await expect(saveSingleFieldGrade(sub.id, { fieldId: ids.f1, score: 1 })).rejects.toMatchObject({ statusCode: 423 });
    await expect(createOfflineGradeColumn(ids.class1, ids.teacher, { title: "15p" })).rejects.toMatchObject({ code: "GRADEBOOK_LOCKED" });
    await expect(setGradebookLock(ids.class1, T(), false)).rejects.toMatchObject({ statusCode: 403 });
    await setGradebookLock(ids.class1, { id: ids.admin, role: "ADMIN" }, false);
    await saveSingleFieldGrade(sub.id, { fieldId: ids.f1, score: 1 });
    expect(await prisma.auditLog.count({ where: { targetId: ids.class1, action: { in: ["GRADEBOOK_LOCKED", "GRADEBOOK_UNLOCKED"] } } })).toBe(2);
  });

  it(".ics feed works with the secret token and returns 401 once revoked", async () => {
    const { token } = await rotateCalendarToken(ids.s1);
    const stored = await prisma.calendarFeedToken.findUnique({ where: { userId: ids.s1 } });
    expect(stored!.tokenHash).not.toBe(token);
    const ics = await buildCalendarFeed(token, "https://lms.example");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain(`UID:session-${ids.session}@pivora`);
    expect(ics).toContain(`UID:due-${ids.asg}@pivora`);
    await revokeCalendarToken(ids.s1);
    await expect(buildCalendarFeed(token, "https://lms.example")).rejects.toMatchObject({ statusCode: 401 });
    const { token: t2 } = await rotateCalendarToken(ids.parent);
    expect(await buildCalendarFeed(t2, "https://x")).toContain(`session-${ids.session}`);
    await prisma.user.update({ where: { id: ids.parent }, data: { isLocked: true } });
    await expect(buildCalendarFeed(t2, "https://x")).rejects.toMatchObject({ statusCode: 401 });
    await prisma.user.update({ where: { id: ids.parent }, data: { isLocked: false } });
  });

  it("live rescue extends time via AssignmentOverride + AuditLog and unlocks device switches", async () => {
    const live = await prisma.submission.create({
      data: { assignmentId: ids.asg, studentId: ids.s1, attemptNo: 2, status: "IN_PROGRESS", maxScore: 2, lockedAt: new Date(), attemptToken: "old-device" },
    });
    await expect(grantEmergencyExtraTime(ids.asg, ids.s1, 90, ids.teacher)).rejects.toMatchObject({ statusCode: 400 });
    const r1 = await grantEmergencyExtraTime(ids.asg, ids.s1, 5, ids.teacher);
    expect(r1.timeLimitMin).toBe(35);
    const r2 = await grantEmergencyExtraTime(ids.asg, ids.s1, 10, ids.teacher);
    expect(r2.timeLimitMin).toBe(45);
    expect(await prisma.auditLog.count({ where: { targetId: ids.asg, action: "LIVE_TIME_EXTENDED" } })).toBe(2);
    await unlockForDeviceSwitch(ids.asg, ids.s1, ids.teacher);
    const after = await prisma.submission.findUniqueOrThrow({ where: { id: live.id } });
    expect(after.lockedAt).toBeNull();
    expect(after.attemptToken).toBeNull();
  });

  it("imports Aiken into a worksheet and maintenance mode blocks non-admin APIs", async () => {
    const res = await importStandardQuestions(
      { id: ids.teacher, role: "TEACHER" },
      { format: "AIKEN", target: "WORKSHEET", worksheetId: ids.ws, content: "2+2?\nA. 3\nB. 4\nANSWER: B\n" }
    );
    expect(res.imported).toBe(1);
    const f = await prisma.field.findFirst({ where: { worksheetId: ids.ws, type: "MULTIPLE_CHOICE" } });
    expect(f?.answerKey).toEqual({ correct: "B" });
    await expect(
      importStandardQuestions({ id: ids.s1, role: "TEACHER" }, { format: "AIKEN", target: "WORKSHEET", worksheetId: ids.ws, content: "a\nA. x\nB. y\nANSWER: A" })
    ).rejects.toMatchObject({ statusCode: 403 });

    await saveBanner(ids.admin, { message: "Bảo trì 10 phút", level: "WARNING", maintenanceMode: true, active: true });
    expect(await isMaintenanceMode()).toBe(true);
    expect((await getActiveBanner(true))?.message).toBe("Bảo trì 10 phút");
    await saveBanner(ids.admin, { message: "", level: "INFO", maintenanceMode: false, active: false });
    expect(await isMaintenanceMode()).toBe(false);
  });
});
