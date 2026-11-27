import type { AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { computeAttendanceSummary } from "@/lib/attendance-calc";
import { getMonthBoundariesUtc } from "@/lib/schedule/recurrence";
import { formatDateTime } from "@/lib/utils";
import { createNotificationsBulk } from "./notificationService";
import { logAudit } from "./auditService";

export interface AttendanceRecordInput {
  studentId: string;
  status: AttendanceStatus;
  note?: string | null;
}

export async function getSessionAttendance(sessionId: string) {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      class: { select: { id: true, name: true, deletedAt: true } },
      attendanceRecords: {
        select: {
          studentId: true,
          status: true,
          note: true,
          markedAt: true,
        },
      },
    },
  });

  if (!session || session.class.deletedAt) {
    throw new AppError("Không tìm thấy buổi học.", 404, "NOT_FOUND");
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      classId: session.classId,
      status: "ACTIVE",
      student: { deletedAt: null },
    },
    orderBy: { student: { name: "asc" } },
    select: {
      student: { select: { id: true, name: true, email: true } },
    },
  });

  const recordByStudent = new Map(session.attendanceRecords.map((r) => [r.studentId, r]));

  const rows = enrollments.map((e) => {
    const rec = recordByStudent.get(e.student.id);
    return {
      studentId: e.student.id,
      name: e.student.name,
      email: e.student.email,
      status: rec?.status ?? null,
      note: rec?.note ?? null,
      markedAt: rec?.markedAt.toISOString() ?? null,
    };
  });

  const summary = computeAttendanceSummary(
    session.attendanceRecords.map((r) => r.status)
  );

  return {
    session: {
      id: session.id,
      classId: session.classId,
      className: session.class.name,
      title: session.title,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      status: session.status,
    },
    students: rows,
    summary,
  };
}

export async function saveSessionAttendance(
  sessionId: string,
  records: AttendanceRecordInput[],
  actorId?: string
) {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      class: { select: { id: true, name: true, deletedAt: true } },
    },
  });

  if (!session || session.class.deletedAt) {
    throw new AppError("Không tìm thấy buổi học.", 404, "NOT_FOUND");
  }
  if (session.status === "CANCELLED") {
    throw new AppError("Không thể điểm danh buổi học đã bị huỷ.", 400, "VALIDATION_ERROR");
  }

  // Deduplicate by studentId (last entry wins)
  const deduped = new Map<string, AttendanceRecordInput>();
  for (const r of records) {
    deduped.set(r.studentId, r);
  }
  const uniqueRecords = Array.from(deduped.values());
  const studentIds = uniqueRecords.map((r) => r.studentId);

  const activeEnrollments = await prisma.enrollment.findMany({
    where: {
      classId: session.classId,
      status: "ACTIVE",
      studentId: { in: studentIds },
      student: { deletedAt: null },
    },
    select: {
      studentId: true,
      student: {
        select: {
          id: true,
          name: true,
          parentLinksAsChild: {
            where: {
              verifiedAt: { not: null },
              parent: { deletedAt: null },
            },
            select: { parentId: true },
          },
        },
      },
    },
  });

  if (activeEnrollments.length !== studentIds.length) {
    throw new AppError(
      "Danh sách điểm danh có học sinh không thuộc lớp học.",
      400,
      "VALIDATION_ERROR"
    );
  }

  const prevRecords = await prisma.attendanceRecord.findMany({
    where: { sessionId, studentId: { in: studentIds } },
    select: { studentId: true, status: true },
  });
  const prevStatusMap = new Map(prevRecords.map((r) => [r.studentId, r.status]));

  const now = new Date();
  await prisma.$transaction(
    uniqueRecords.map((rec) =>
      prisma.attendanceRecord.upsert({
        where: {
          sessionId_studentId: {
            sessionId,
            studentId: rec.studentId,
          },
        },
        create: {
          sessionId,
          studentId: rec.studentId,
          status: rec.status,
          note: rec.note?.trim() || null,
          markedById: actorId ?? null,
          markedAt: now,
        },
        update: {
          status: rec.status,
          note: rec.note?.trim() || null,
          markedById: actorId ?? null,
          markedAt: now,
        },
      })
    )
  );

  // Send ATTENDANCE_ALERT to verified parents when status newly becomes ABSENT or LATE
  const studentMap = new Map(activeEnrollments.map((e) => [e.studentId, e.student]));
  const notifications: Array<{
    userId: string;
    type: "ATTENDANCE_ALERT";
    title: string;
    body: string;
    link: string;
  }> = [];

  for (const rec of uniqueRecords) {
    const prevStatus = prevStatusMap.get(rec.studentId);
    const newlyAlertable =
      prevStatus !== rec.status && (rec.status === "ABSENT" || rec.status === "LATE");
    if (!newlyAlertable) continue;

    const stu = studentMap.get(rec.studentId);
    if (!stu || stu.parentLinksAsChild.length === 0) continue;

    const statusLabel = rec.status === "ABSENT" ? "vắng không phép" : "đi muộn";
    const noteSuffix = rec.note?.trim() ? ` — Ghi chú: ${rec.note.trim()}` : "";

    for (const pl of stu.parentLinksAsChild) {
      notifications.push({
        userId: pl.parentId,
        type: "ATTENDANCE_ALERT",
        title: `Điểm danh: ${stu.name} ${statusLabel}`,
        body: `${session.class.name} • ${session.title} (${formatDateTime(session.startsAt)})${noteSuffix}`,
        link: `/parent?child=${stu.id}`,
      });
    }
  }

  if (notifications.length > 0) {
    await createNotificationsBulk(notifications);
  }

  await logAudit({
    actorId: actorId ?? null,
    action: "ATTENDANCE_SAVED",
    targetType: "CLASS",
    targetId: session.classId,
    summary: `Lưu điểm danh buổi "${session.title}" (${uniqueRecords.length} học sinh)`,
    meta: { sessionId, count: uniqueRecords.length, alertsSent: notifications.length },
  });

  return getSessionAttendance(sessionId);
}

export async function getMonthlyAttendanceReport(
  classId: string,
  year: number,
  month: number
) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }

  const { start, end } = getMonthBoundariesUtc(year, month);

  const [enrollments, sessions] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classId, status: "ACTIVE", student: { deletedAt: null } },
      orderBy: { student: { name: "asc" } },
      select: { student: { select: { id: true, name: true, email: true } } },
    }),
    prisma.classSession.findMany({
      where: {
        classId,
        status: { not: "CANCELLED" },
        startsAt: { gte: start, lte: end },
      },
      orderBy: { startsAt: "asc" },
      include: {
        attendanceRecords: {
          select: { studentId: true, status: true, note: true },
        },
      },
    }),
  ]);

  const rows = enrollments.map((e) => {
    const statuses: AttendanceStatus[] = [];
    const bySession: Record<string, AttendanceStatus | null> = {};

    for (const s of sessions) {
      const rec = s.attendanceRecords.find((r) => r.studentId === e.student.id);
      if (rec) {
        statuses.push(rec.status);
        bySession[s.id] = rec.status;
      } else {
        bySession[s.id] = null;
      }
    }

    return {
      student: e.student,
      bySession,
      summary: computeAttendanceSummary(statuses),
    };
  });

  const rates = rows
    .map((r) => r.summary.attendanceRatePct)
    .filter((v): v is number => v !== null);
  const classAvgRatePct =
    rates.length > 0
      ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10
      : null;

  return {
    class: { id: cls.id, name: cls.name },
    year,
    month,
    sessionCount: sessions.length,
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
    })),
    rows,
    classAvgRatePct,
  };
}
