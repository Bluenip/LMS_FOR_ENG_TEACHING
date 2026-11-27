import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import {
  createMakeupSession,
  createScheduleRuleAndGenerateSessions,
  deleteScheduleRule,
  listScheduleForStudent,
} from "@/server/scheduleService";
import {
  getMonthlyAttendanceReport,
  saveSessionAttendance,
} from "@/server/attendanceService";
import { exportClassGradebookExcel, getClassGradebook } from "@/server/gradebookService";
import { getChildOverviewForParent } from "@/server/parentService";

const suffix = `p23_${Date.now()}`;
let adminId = "";
let teacherId = "";
let teacher2Id = "";
let stu1Id = "";
let stu2Id = "";
let outsiderStuId = "";
let parent1Id = "";
let class1Id = "";
let class2Id = "";

beforeAll(async () => {
  const admin = await prisma.user.findUnique({ where: { email: "admin@engclass.vn" } });
  adminId = admin!.id;

  const t1 = await createAccount(
    { id: adminId, role: "ADMIN" },
    {
      name: `GV P23 ${suffix}`,
      email: `t1_${suffix}@test.vn`,
      password: "password123",
      role: "TEACHER",
    }
  );
  teacherId = t1.user.id;

  const t2 = await createAccount(
    { id: adminId, role: "ADMIN" },
    {
      name: `GV2 P23 ${suffix}`,
      email: `t2_${suffix}@test.vn`,
      password: "password123",
      role: "TEACHER",
    }
  );
  teacher2Id = t2.user.id;

  const s1 = await createAccount(
    { id: adminId, role: "ADMIN" },
    {
      name: `HS1 P23 ${suffix}`,
      email: `s1_${suffix}@test.vn`,
      password: "password123",
      role: "STUDENT",
    }
  );
  stu1Id = s1.user.id;

  const s2 = await createAccount(
    { id: adminId, role: "ADMIN" },
    {
      name: `HS2 P23 Private ${suffix}`,
      email: `s2_${suffix}@test.vn`,
      password: "password123",
      role: "STUDENT",
    }
  );
  stu2Id = s2.user.id;

  const sOut = await createAccount(
    { id: adminId, role: "ADMIN" },
    {
      name: `HS Outside P23 ${suffix}`,
      email: `sout_${suffix}@test.vn`,
      password: "password123",
      role: "STUDENT",
    }
  );
  outsiderStuId = sOut.user.id;

  const p1 = await createAccount(
    { id: adminId, role: "ADMIN" },
    {
      name: `PH1 P23 ${suffix}`,
      email: `p1_${suffix}@test.vn`,
      password: "password123",
      role: "PARENT",
    }
  );
  parent1Id = p1.user.id;

  await prisma.parentLink.create({
    data: {
      parentId: parent1Id,
      studentId: stu1Id,
      relation: "Mẹ",
      verifiedAt: new Date(),
    },
  });

  const c1 = await createClass(teacherId, { name: `Class1 P23 ${suffix}` });
  class1Id = c1.id;
  const c2 = await createClass(teacher2Id, { name: `Class2 P23 ${suffix}` });
  class2Id = c2.id;

  await prisma.enrollment.createMany({
    data: [
      { classId: class1Id, studentId: stu1Id, status: "ACTIVE" },
      { classId: class1Id, studentId: stu2Id, status: "ACTIVE" },
      { classId: class2Id, studentId: outsiderStuId, status: "ACTIVE" },
    ],
  });
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: parent1Id } });
  await prisma.class.deleteMany({ where: { id: { in: [class1Id, class2Id] } } });
  await prisma.user.deleteMany({
    where: { id: { in: [teacherId, teacher2Id, stu1Id, stu2Id, outsiderStuId, parent1Id] } },
  });
});

describe("Phase 23 integration: Schedule, Attendance Alerts, Gradebook & Parent Privacy", () => {
  it("generates weekly sessions, triggers single ATTENDANCE_ALERT to verified parent, blocks outsider IDOR, and updates Gradebook + Parent Portal", async () => {
    // 1. Recurring rule generates 4 weekly sessions
    const ruleRes = await createScheduleRuleAndGenerateSessions(
      class1Id,
      {
        dayOfWeek: 3, // Wednesday
        startTime: "19:00",
        endTime: "20:30",
        title: `Buổi định kỳ ${suffix}`,
        meetingUrl: "https://meet.google.com/test-p23",
        generateWeeks: 4,
      },
      teacherId
    );
    expect(ruleRes.generatedCount).toBeGreaterThanOrEqual(4);

    // 2. Makeup session in current month
    const now = new Date();
    const sStart = new Date(now.getTime() - 2 * 3600_000);
    const sEnd = new Date(now.getTime() - 3600_000);
    const makeup = await createMakeupSession(
      class1Id,
      {
        title: `Buổi ôn tập P23 ${suffix}`,
        startsAt: sStart.toISOString(),
        endsAt: sEnd.toISOString(),
        isMakeup: true,
        meetingUrl: "https://zoom.us/j/123456",
      },
      teacherId
    );

    // 3. Reject outsider student from another class (anti-IDOR)
    await expect(
      saveSessionAttendance(
        makeup.id,
        [{ studentId: outsiderStuId, status: "ABSENT" }],
        teacherId
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // 4. Mark stu1 ABSENT and stu2 PRESENT -> verified parent1 receives 1 ATTENDANCE_ALERT
    await saveSessionAttendance(
      makeup.id,
      [
        { studentId: stu1Id, status: "ABSENT", note: "Nghỉ không báo trước" },
        { studentId: stu2Id, status: "PRESENT" },
      ],
      teacherId
    );

    const alerts1 = await prisma.notification.findMany({
      where: { userId: parent1Id, type: "ATTENDANCE_ALERT" },
    });
    expect(alerts1).toHaveLength(1);
    expect(alerts1[0]!.title).toContain("vắng không phép");
    expect(alerts1[0]!.body).toContain("Nghỉ không báo trước");

    // Re-saving unchanged ABSENT status must NOT spam duplicate notifications
    await saveSessionAttendance(
      makeup.id,
      [
        { studentId: stu1Id, status: "ABSENT", note: "Nghỉ không báo trước" },
        { studentId: stu2Id, status: "PRESENT" },
      ],
      teacherId
    );
    const alertsAfterResave = await prisma.notification.findMany({
      where: { userId: parent1Id, type: "ATTENDANCE_ALERT" },
    });
    expect(alertsAfterResave).toHaveLength(1);

    // Updating status to LATE sends new alert
    await saveSessionAttendance(
      makeup.id,
      [
        { studentId: stu1Id, status: "LATE", note: "Vào muộn" },
        { studentId: stu2Id, status: "PRESENT" },
      ],
      teacherId
    );
    const alertsAfterLate = await prisma.notification.findMany({
      where: { userId: parent1Id, type: "ATTENDANCE_ALERT" },
    });
    expect(alertsAfterLate).toHaveLength(2);
    expect(alertsAfterLate.some((n) => n.title.includes("đi muộn"))).toBe(true);

    // 5. Monthly attendance report + Gradebook + Excel export
    const monthReport = await getMonthlyAttendanceReport(
      class1Id,
      sStart.getFullYear(),
      sStart.getMonth() + 1
    );
    const stu1Rep = monthReport.rows.find((r) => r.student.id === stu1Id);
    expect(stu1Rep?.summary.lateCount).toBe(1);
    expect(stu1Rep?.summary.attendanceRatePct).toBe(80);

    const gb = await getClassGradebook(class1Id);
    const gbStu1 = gb.rows.find((r) => r.student.id === stu1Id);
    expect(gbStu1?.attendance?.attendanceRatePct).toBe(80);

    const { buffer } = await exportClassGradebookExcel(class1Id, undefined, "vi");
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");

    // 6. Student schedule & Parent Portal strict scoping (never leaks stu2)
    const stu1Sched = await listScheduleForStudent(stu1Id, {
      from: new Date(now.getTime() - 86_400_000),
      to: new Date(now.getTime() + 30 * 86_400_000),
    });
    expect(stu1Sched.sessions.some((s) => s.id === makeup.id && s.myAttendance?.status === "LATE")).toBe(true);

    const parentOverview = await getChildOverviewForParent(stu1Id, class1Id);
    expect(parentOverview.attendance.attendanceRatePct).toBe(80);
    expect(JSON.stringify(parentOverview)).not.toContain(stu2Id);
    expect(JSON.stringify(parentOverview)).not.toContain(`HS2 P23 Private ${suffix}`);

    // 7. Deleting rule removes future unmarked scheduled sessions cleanly
    await deleteScheduleRule(class1Id, ruleRes.rule.id, teacherId);
    const remainingRules = await prisma.classScheduleRule.count({ where: { id: ruleRes.rule.id } });
    expect(remainingRules).toBe(0);
  });
});
