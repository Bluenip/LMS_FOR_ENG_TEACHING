import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { publishAssignmentLive } from "@/lib/proctor-bus";
import { logAudit } from "./auditService";
import { createNotification } from "./notificationService";

async function loadAttempt(assignmentId: string, studentId: string) {
  const sub = await prisma.submission.findFirst({
    where: { assignmentId, studentId },
    orderBy: { attemptNo: "desc" },
    select: { id: true, status: true, student: { select: { name: true } }, assignment: { select: { title: true, timeLimitMin: true, dueAt: true } } },
  });
  if (!sub) throw new AppError("Học sinh chưa bắt đầu làm bài này.", 404, "NOT_FOUND");
  return sub;
}

/** Private message that pops up immediately on that student's exam screen. */
export async function sendDirectExamMessage(assignmentId: string, studentId: string, message: string, actorId: string) {
  const sub = await loadAttempt(assignmentId, studentId);
  const msg = message.trim().slice(0, 500);
  if (!msg) throw new AppError("Vui lòng nhập nội dung tin nhắn.", 400, "VALIDATION_ERROR");
  publishAssignmentLive({
    kind: "TEACHER_MESSAGE",
    assignmentId,
    submissionId: sub.id,
    studentId,
    studentName: sub.student.name,
    message: msg,
    at: new Date().toISOString(),
  });
  await createNotification({
    userId: studentId,
    type: "PROCTOR_REMINDER",
    title: `Tin nhắn từ giáo viên (${sub.assignment.title})`.slice(0, 200),
    body: msg,
    link: `/student/assignments/${assignmentId}/do`,
  });
  await logAudit({
    actorId,
    action: "LIVE_MESSAGE_SENT",
    targetType: "ASSIGNMENT",
    targetId: assignmentId,
    summary: `Nhắn riêng cho ${sub.student.name} trong phòng thi`,
    summaryEn: `Private message to ${sub.student.name} during the exam`,
    meta: { studentId, length: msg.length },
  });
  return { ok: true };
}

/**
 * Adds 1–60 minutes for one student right now (per-student override: time limit if the assignment
 * is timed, otherwise the due date) and refreshes the countdown on their screen.
 */
export async function grantEmergencyExtraTime(assignmentId: string, studentId: string, extraMin: number, actorId: string) {
  const extra = Math.round(extraMin);
  if (!(extra >= 1 && extra <= 60)) throw new AppError("Chỉ cộng được từ 1 đến 60 phút.", 400, "VALIDATION_ERROR");
  const sub = await loadAttempt(assignmentId, studentId);
  const existing = await prisma.assignmentOverride.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId } } });
  const baseLimit = existing?.timeLimitMin ?? sub.assignment.timeLimitMin;
  const baseDue = existing?.dueAt ?? sub.assignment.dueAt;
  let data: { timeLimitMin?: number; dueAt?: Date };
  if (baseLimit) data = { timeLimitMin: baseLimit + extra };
  else if (baseDue) data = { dueAt: new Date(Math.max(baseDue.getTime(), Date.now()) + extra * 60_000) };
  else throw new AppError("Bài này không giới hạn thời gian.", 400, "NO_TIME_LIMIT");

  const override = await prisma.assignmentOverride.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId } },
    create: { assignmentId, studentId, note: `+${extra} phút (cứu hộ phòng thi)`, ...data },
    update: { ...data, note: `${existing?.note ? `${existing.note}; ` : ""}+${extra} phút (cứu hộ)`.slice(0, 500) },
  });
  publishAssignmentLive({
    kind: "TIME_EXTENDED",
    assignmentId,
    submissionId: sub.id,
    studentId,
    studentName: sub.student.name,
    message: `+${extra}`,
    at: new Date().toISOString(),
  });
  await logAudit({
    actorId,
    action: "LIVE_TIME_EXTENDED",
    targetType: "ASSIGNMENT",
    targetId: assignmentId,
    summary: `Cộng ${extra} phút cho ${sub.student.name}`,
    summaryEn: `Added ${extra} minutes for ${sub.student.name}`,
    meta: { studentId, extra },
  });
  return { timeLimitMin: override.timeLimitMin, dueAt: override.dueAt?.toISOString() ?? null };
}

/**
 * Lets a student continue on another device: clears the lock and the attempt token
 * (the next device that opens the exam receives a fresh token).
 */
export async function unlockForDeviceSwitch(assignmentId: string, studentId: string, actorId: string) {
  const sub = await loadAttempt(assignmentId, studentId);
  if (sub.status !== "IN_PROGRESS") throw new AppError("Bài làm không còn ở trạng thái đang làm.", 409, "NOT_IN_PROGRESS");
  await prisma.submission.update({
    where: { id: sub.id },
    data: { lockedAt: null, attemptToken: null, unlockedById: actorId },
  });
  publishAssignmentLive({
    kind: "SUBMISSION_UNLOCKED",
    assignmentId,
    submissionId: sub.id,
    studentId,
    studentName: sub.student.name,
    message: "Giáo viên đã mở khoá để đổi thiết bị.",
    at: new Date().toISOString(),
  });
  await logAudit({
    actorId,
    action: "LIVE_DEVICE_UNLOCKED",
    targetType: "ASSIGNMENT",
    targetId: assignmentId,
    summary: `Mở khoá đổi thiết bị cho ${sub.student.name}`,
    summaryEn: `Unlocked ${sub.student.name} to switch devices`,
    meta: { studentId, submissionId: sub.id },
  });
  return { ok: true };
}
