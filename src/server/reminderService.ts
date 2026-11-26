import { prisma } from "@/lib/db";
import { resolveEffectiveAssignment } from "@/lib/assignment-effective";
import { createNotificationsBulk } from "@/server/notificationService";

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ReminderRunSummary {
  checkedAssignments: number;
  sentCount: number;
}

/**
 * Finds unsubmitted students whose effective assignment deadline is within the next 24 hours
 * and sends a single one-time DUE_REMINDER notification per (assignment, student).
 */
export async function sendDueSoonReminders(now = new Date()): Promise<ReminderRunSummary> {
  const horizon = new Date(now.getTime() + REMINDER_WINDOW_MS);

  const candidates = await prisma.assignment.findMany({
    where: {
      remindBeforeDue: true,
      class: { deletedAt: null, archived: false },
      OR: [
        { dueAt: { gt: now, lte: horizon } },
        { overrides: { some: { dueAt: { gt: now, lte: horizon } } } },
      ],
    },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          enrollments: {
            where: {
              status: "ACTIVE",
              student: { deletedAt: null },
            },
            select: { studentId: true },
          },
        },
      },
      targets: { select: { studentId: true } },
      overrides: true,
      reminders: { select: { studentId: true } },
      submissions: {
        where: { status: { in: ["SUBMITTED", "GRADED"] } },
        select: { studentId: true },
      },
    },
  });

  let sentCount = 0;

  for (const asg of candidates) {
    if (asg.openAt && asg.openAt > now) continue;

    const targetSet =
      asg.targets.length > 0 ? new Set(asg.targets.map((t) => t.studentId)) : null;
    const submittedSet = new Set(asg.submissions.map((s) => s.studentId));
    const remindedSet = new Set(asg.reminders.map((r) => r.studentId));
    const overrideByStudent = new Map(asg.overrides.map((o) => [o.studentId, o]));

    const toNotify: Array<{
      studentId: string;
      hoursLeft: number;
    }> = [];

    for (const enr of asg.class.enrollments) {
      const sid = enr.studentId;
      if (targetSet && !targetSet.has(sid)) continue;
      if (submittedSet.has(sid)) continue;
      if (remindedSet.has(sid)) continue;

      const effective = resolveEffectiveAssignment(asg, overrideByStudent.get(sid) ?? null);
      if (!effective.dueAt) continue;
      const diffMs = effective.dueAt.getTime() - now.getTime();
      if (diffMs <= 0 || diffMs > REMINDER_WINDOW_MS) continue;

      const hoursLeft = Math.max(1, Math.round(diffMs / (60 * 60 * 1000)));
      toNotify.push({ studentId: sid, hoursLeft });
    }

    if (toNotify.length === 0) continue;

    const notifications: Array<{
      userId: string;
      type: "DUE_REMINDER";
      title: string;
      body: string;
      link: string;
    }> = [];

    for (const item of toNotify) {
      try {
        await prisma.assignmentReminderSent.create({
          data: {
            assignmentId: asg.id,
            studentId: item.studentId,
            sentAt: now,
          },
        });
        notifications.push({
          userId: item.studentId,
          type: "DUE_REMINDER",
          title: `Sắp hết hạn nộp: ${asg.title}`,
          body: `Còn khoảng ${item.hoursLeft} giờ để nộp bài cho lớp ${asg.class.name}.`,
          link:
            asg.proctorMode !== "OFF" || asg.requireCamera || asg.requireMicMonitor
              ? `/student/assignments/${asg.id}/rules`
              : `/student/assignments/${asg.id}/do`,
        });
      } catch {
        // Unique constraint violation (already recorded by concurrent worker) -> skip safely
      }
    }

    if (notifications.length > 0) {
      await createNotificationsBulk(notifications);
      sentCount += notifications.length;
    }
  }

  return {
    checkedAssignments: candidates.length,
    sentCount,
  };
}
