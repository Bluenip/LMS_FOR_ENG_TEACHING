import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/utils";
import { logAudit } from "@/server/auditService";
import { createNotification } from "@/server/notificationService";

export interface UpsertOverrideInput {
  studentId: string;
  extraAttempts: number;
  dueAt?: string | null;
  timeLimitMin?: number | null;
  note?: string | null;
}

export async function listAssignmentOverrides(assignmentId: string) {
  return prisma.assignmentOverride.findMany({
    where: { assignmentId },
    include: {
      student: { select: { id: true, name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function upsertAssignmentOverride(
  assignmentId: string,
  input: UpsertOverrideInput,
  actorId?: string
) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      title: true,
      classId: true,
      proctorMode: true,
      requireCamera: true,
    },
  });
  if (!assignment) {
    throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      classId_studentId: { classId: assignment.classId, studentId: input.studentId },
    },
    include: {
      student: { select: { id: true, name: true, deletedAt: true } },
    },
  });
  if (!enrollment || enrollment.status !== "ACTIVE" || enrollment.student.deletedAt) {
    throw new AppError(
      "Học sinh không thuộc lớp học của bài tập này hoặc tài khoản đang bị xoá.",
      400,
      "INVALID_STUDENT"
    );
  }

  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  const extraAttempts = Math.max(0, Math.floor(input.extraAttempts ?? 0));
  const timeLimitMin = input.timeLimitMin ?? null;
  const note = input.note?.trim() || null;

  const override = await prisma.assignmentOverride.upsert({
    where: {
      assignmentId_studentId: { assignmentId, studentId: input.studentId },
    },
    create: {
      assignmentId,
      studentId: input.studentId,
      extraAttempts,
      dueAt,
      timeLimitMin,
      note,
    },
    update: {
      extraAttempts,
      dueAt,
      timeLimitMin,
      note,
    },
    include: {
      student: { select: { id: true, name: true, email: true } },
    },
  });

  if (extraAttempts > 0 || dueAt !== null || timeLimitMin !== null) {
    const parts = [
      extraAttempts > 0 ? `+${extraAttempts} lượt làm` : null,
      dueAt ? `Hạn riêng: ${formatDateTime(dueAt)}` : null,
      timeLimitMin ? `Thời gian: ${timeLimitMin} phút` : null,
    ].filter(Boolean);

    await createNotification({
      userId: input.studentId,
      type: "ASSIGNMENT_CREATED",
      title: `Ngoại lệ mới cho bài ${assignment.title}`,
      body: parts.join(" • ") || "Giáo viên đã điều chỉnh cài đặt bài tập cho riêng bạn.",
      link:
        assignment.proctorMode !== "OFF" || assignment.requireCamera
          ? `/student/assignments/${assignment.id}/rules`
          : `/student/assignments/${assignment.id}/do`,
    });
  }

  await logAudit({
    actorId: actorId ?? null,
    action: "ASSIGNMENT_OVERRIDE_SAVED",
    targetType: "ASSIGNMENT",
    targetId: assignment.id,
    summary: `Cấp ngoại lệ bài "${assignment.title}" cho ${enrollment.student.name}`,
    summaryEn: `Saved override on "${assignment.title}" for ${enrollment.student.name}`,
    meta: {
      assignmentId: assignment.id,
      studentId: input.studentId,
      extraAttempts,
      dueAt: dueAt?.toISOString() ?? null,
      timeLimitMin,
    },
  });

  return override;
}

export async function deleteAssignmentOverride(
  assignmentId: string,
  studentId: string,
  actorId?: string
) {
  const existing = await prisma.assignmentOverride.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
    include: {
      assignment: { select: { title: true } },
      student: { select: { name: true } },
    },
  });
  if (!existing) {
    throw new AppError("Không tìm thấy ngoại lệ cho học sinh này.", 404, "NOT_FOUND");
  }

  await prisma.assignmentOverride.delete({
    where: { id: existing.id },
  });

  await logAudit({
    actorId: actorId ?? null,
    action: "ASSIGNMENT_OVERRIDE_REMOVED",
    targetType: "ASSIGNMENT",
    targetId: assignmentId,
    summary: `Xoá ngoại lệ bài "${existing.assignment.title}" của ${existing.student.name}`,
    summaryEn: `Removed override on "${existing.assignment.title}" for ${existing.student.name}`,
    meta: { assignmentId, studentId },
  });

  return { ok: true };
}
