import type { LeaveRequestStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { logAudit } from "./auditService";
import { createNotificationsBulk } from "./notificationService";

async function assertVerifiedParent(parentId: string, studentId: string) {
  const link = await prisma.parentLink.findUnique({
    where: { parentId_studentId: { parentId, studentId } },
    select: { verifiedAt: true },
  });
  if (!link?.verifiedAt) throw new AppError("Bạn không có quyền xem thông tin học sinh này.", 403, "FORBIDDEN");
}

/** Upcoming sessions (next 30 days) of the child's active classes, with any existing request. */
export async function listUpcomingSessionsForChild(parentId: string, studentId: string) {
  await assertVerifiedParent(parentId, studentId);
  const now = new Date();
  const sessions = await prisma.classSession.findMany({
    where: {
      startsAt: { gt: now, lt: new Date(now.getTime() + 30 * 86_400_000) },
      status: { not: "CANCELLED" },
      class: { deletedAt: null, enrollments: { some: { studentId, status: "ACTIVE" } } },
    },
    orderBy: { startsAt: "asc" },
    take: 40,
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      class: { select: { id: true, name: true } },
      leaveRequests: { where: { studentId }, select: { id: true, status: true, reason: true, reviewNote: true } },
    },
  });
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    classId: s.class.id,
    className: s.class.name,
    request: s.leaveRequests[0] ?? null,
  }));
}

export async function createLeaveRequest(parentId: string, input: { studentId: string; sessionId: string; reason: string }) {
  await assertVerifiedParent(parentId, input.studentId);
  const session = await prisma.classSession.findUnique({
    where: { id: input.sessionId },
    select: { id: true, classId: true, startsAt: true, title: true, status: true, class: { select: { teacherId: true, name: true, deletedAt: true } } },
  });
  if (!session || session.class.deletedAt) throw new AppError("Không tìm thấy buổi học.", 404, "NOT_FOUND");
  if (session.startsAt <= new Date() || session.status === "CANCELLED") {
    throw new AppError("Chỉ gửi đơn cho buổi học sắp tới.", 400, "LEAVE_SESSION_PAST");
  }
  const enrolled = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId: session.classId, studentId: input.studentId } },
    select: { status: true },
  });
  if (enrolled?.status !== "ACTIVE") throw new AppError("Học sinh không thuộc lớp này.", 400, "OMR_STUDENT_NOT_IN_CLASS");
  const existing = await prisma.leaveRequest.findUnique({
    where: { sessionId_studentId: { sessionId: session.id, studentId: input.studentId } },
  });
  if (existing) throw new AppError("Đã có đơn xin nghỉ cho buổi này.", 409, "LEAVE_DUPLICATE");

  const req = await prisma.leaveRequest.create({
    data: { classId: session.classId, sessionId: session.id, studentId: input.studentId, parentId, reason: input.reason.trim().slice(0, 500) },
    include: { student: { select: { name: true } } },
  });
  await createNotificationsBulk([
    {
      userId: session.class.teacherId,
      type: "ATTENDANCE_ALERT",
      title: `Đơn xin nghỉ: ${req.student.name} (${session.class.name})`.slice(0, 200),
      body: `${session.title} — ${input.reason.trim().slice(0, 200)}`,
      link: `/teacher/classes/${session.classId}?tab=schedule`,
    },
  ]);
  return { id: req.id };
}

export async function listLeaveRequestsForClass(classId: string, status?: LeaveRequestStatus | null) {
  const rows = await prisma.leaveRequest.findMany({
    where: { classId, ...(status ? { status } : {}) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      reason: true,
      status: true,
      reviewNote: true,
      createdAt: true,
      student: { select: { id: true, name: true } },
      parent: { select: { name: true } },
      session: { select: { id: true, title: true, startsAt: true } },
    },
  });
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    session: { ...r.session, startsAt: r.session.startsAt.toISOString() },
  }));
}

/**
 * Approve / reject. Approval marks the session attendance EXCUSED (with the reason) in the same
 * transaction, then the parent is notified either way.
 */
export async function reviewLeaveRequest(
  requestId: string,
  classId: string,
  actor: { id: string; role: Role },
  input: { status: "APPROVED" | "REJECTED"; note?: string | null }
) {
  const req = await prisma.leaveRequest.findFirst({
    where: { id: requestId, classId },
    include: { session: { select: { title: true } }, student: { select: { name: true } } },
  });
  if (!req) throw new AppError("Không tìm thấy đơn xin nghỉ.", 404, "NOT_FOUND");
  if (req.status !== "PENDING") throw new AppError("Đơn này đã được xử lý.", 409, "LEAVE_ALREADY_REVIEWED");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: req.id },
      data: { status: input.status, reviewNote: input.note?.trim().slice(0, 300) || null, reviewedById: actor.id, reviewedAt: now },
    });
    if (input.status === "APPROVED") {
      await tx.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId: req.sessionId, studentId: req.studentId } },
        create: { sessionId: req.sessionId, studentId: req.studentId, status: "EXCUSED", note: `Đơn xin nghỉ: ${req.reason}`.slice(0, 300), markedById: actor.id, markedAt: now },
        update: { status: "EXCUSED", note: `Đơn xin nghỉ: ${req.reason}`.slice(0, 300), markedById: actor.id, markedAt: now },
      });
    }
  });
  await createNotificationsBulk([
    {
      userId: req.parentId,
      type: "ATTENDANCE_ALERT",
      title: input.status === "APPROVED" ? `Đã duyệt đơn nghỉ của ${req.student.name}` : `Đơn nghỉ của ${req.student.name} chưa được duyệt`,
      body: `${req.session.title}${input.note ? ` — ${input.note}` : ""}`.slice(0, 300),
      link: `/parent?childId=${req.studentId}`,
    },
  ]);
  await logAudit({
    actorId: actor.id,
    action: "LEAVE_REQUEST_REVIEWED",
    targetType: "CLASS",
    targetId: classId,
    summary: `${input.status === "APPROVED" ? "Duyệt" : "Từ chối"} đơn nghỉ của ${req.student.name}`,
    summaryEn: `${input.status === "APPROVED" ? "Approved" : "Rejected"} leave request of ${req.student.name}`,
  });
  return { ok: true, status: input.status };
}
