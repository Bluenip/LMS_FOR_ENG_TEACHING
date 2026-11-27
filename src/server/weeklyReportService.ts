import { prisma } from "@/lib/db";
import { computeAttendanceSummary } from "@/lib/attendance-calc";
import { normalizeToScale10, round2 } from "@/lib/gradebook-calc";
import { getVnWeekKey } from "@/lib/streak";
import { createNotification } from "./notificationService";
import { sendEmailNotification, sendPushToUser } from "./externalNotifyService";

const VN_OFFSET_MS = 7 * 3_600_000;

function isSunday19hVn(now: Date): boolean {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return vn.getUTCDay() === 0 && vn.getUTCHours() === 19;
}

/**
 * Generates weekly parent progress summaries covering the past 7 days:
 * - graded assignments & avg score (/10)
 * - pending / unsubmitted assignments
 * - attendance summary
 * - shared proctor violations (`shareProctorWithParent === true`)
 * Runs automatically on Sunday 19:00 Asia/Ho_Chi_Minh or immediately with `{ force: true }`.
 */
export async function runWeeklyParentReports(opts?: { now?: Date; force?: boolean }) {
  const now = opts?.now ?? new Date();
  if (!opts?.force && !isSunday19hVn(now)) {
    return { ran: false, sentCount: 0, reason: "outside_schedule_window" };
  }

  const weekKey = getVnWeekKey(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

  const links = await prisma.parentLink.findMany({
    where: {
      verifiedAt: { not: null },
      parent: { deletedAt: null, isLocked: false },
      student: { deletedAt: null, isLocked: false },
    },
    select: {
      parentId: true,
      studentId: true,
      parent: { select: { id: true, name: true, email: true } },
      student: { select: { id: true, name: true } },
    },
  });

  let sentCount = 0;

  for (const link of links) {
    const already = await prisma.weeklyReportSent.findUnique({
      where: {
        parentId_studentId_weekKey: {
          parentId: link.parentId,
          studentId: link.studentId,
          weekKey,
        },
      },
    });
    if (already) continue;

    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: link.studentId,
        status: "ACTIVE",
        class: { deletedAt: null, archived: false },
      },
      select: { classId: true },
    });
    const classIds = enrollments.map((e) => e.classId);
    if (classIds.length === 0) continue;

    const [recentSubs, pendingAsgs, attRecs, proctorAlertsCount] = await Promise.all([
      prisma.submission.findMany({
        where: {
          studentId: link.studentId,
          assignment: { classId: { in: classIds } },
          status: { in: ["SUBMITTED", "GRADED"] },
          submittedAt: { gte: sevenDaysAgo, lte: now },
        },
        select: { totalScore: true, autoScore: true, maxScore: true },
      }),
      prisma.assignment.count({
        where: {
          classId: { in: classIds },
          OR: [{ dueAt: null }, { dueAt: { gte: sevenDaysAgo } }],
          AND: [
            { OR: [{ targets: { none: {} } }, { targets: { some: { studentId: link.studentId } } }] },
          ],
          submissions: {
            none: {
              studentId: link.studentId,
              status: { in: ["SUBMITTED", "GRADED"] },
            },
          },
        },
      }),
      prisma.attendanceRecord.findMany({
        where: {
          studentId: link.studentId,
          session: {
            classId: { in: classIds },
            status: { not: "CANCELLED" },
            startsAt: { gte: sevenDaysAgo, lte: now },
          },
        },
        select: { status: true },
      }),
      prisma.submission.count({
        where: {
          studentId: link.studentId,
          assignment: { classId: { in: classIds }, shareProctorWithParent: true },
          submittedAt: { gte: sevenDaysAgo, lte: now },
          violationCount: { gt: 0 },
        },
      }),
    ]);

    const scores10 = recentSubs
      .map((s) => {
        const raw = s.totalScore ?? s.autoScore;
        return raw !== null ? normalizeToScale10(raw, s.maxScore) : null;
      })
      .filter((v): v is number => v !== null);
    const avg10 =
      scores10.length > 0
        ? round2(scores10.reduce((a, b) => a + b, 0) / scores10.length)
        : null;
    const att = computeAttendanceSummary(attRecs.map((r) => r.status));

    const parts: string[] = [
      `Đã nộp ${recentSubs.length} bài${avg10 !== null ? ` (ĐTB ${avg10}/10)` : ""}`,
      `Chưa nộp: ${pendingAsgs} bài`,
    ];
    if (att.totalMarked > 0) {
      parts.push(`Chuyên cần: ${att.attendanceRatePct}% (Vắng KP ${att.absentCount})`);
    }
    if (proctorAlertsCount > 0) {
      parts.push(`Cảnh báo quy chế thi: ${proctorAlertsCount} bài`);
    }
    const summaryBody = parts.join(" • ");
    const title = `Báo cáo tuần (${weekKey}): ${link.student.name}`;

    await createNotification({
      userId: link.parentId,
      type: "WEEKLY_REPORT",
      title,
      body: summaryBody,
      link: `/parent?child=${link.studentId}`,
    });

    await sendEmailNotification({
      userId: link.parentId,
      toEmail: link.parent.email,
      category: "weeklyReport",
      subject: `[Pivora] ${title}`,
      text: `Kính gửi ${link.parent.name},\n\nTổng kết tuần ${weekKey} của học sinh ${link.student.name}:\n${summaryBody}\n\nXem chi tiết tại Cổng Phụ huynh Pivora.`,
    }).catch(() => undefined);

    await sendPushToUser(link.parentId, {
      title,
      body: summaryBody,
      url: `/parent?child=${link.studentId}`,
    }).catch(() => undefined);

    await prisma.weeklyReportSent.createMany({
      data: [{ parentId: link.parentId, studentId: link.studentId, weekKey }],
      skipDuplicates: true,
    });
    sentCount++;
  }

  return { ran: true, weekKey, sentCount };
}
