import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hasMinClassRole } from "@/lib/class-roles";
import { canRevealResult } from "./submissionService";
import { getStudentGroupIds } from "./classGroupService";
import { resolveUserClassRole } from "./classRoleHelper";
import { createNotificationsBulk } from "./notificationService";

interface Actor {
  id: string;
  role: Role;
}

async function teacherRole(classId: string, actor: Actor) {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true } });
  if (!cls) return null;
  return resolveUserClassRole(classId, actor.id, actor.role, cls.teacherId);
}

/**
 * A student may ask about one question only after submitting and once results are visible
 * (no questions while the exam is running).
 */
export async function createQuestionDoubt(assignmentId: string, studentId: string, input: { fieldId: string; question: string }) {
  const a = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      title: true,
      classId: true,
      showResult: true,
      dueAt: true,
      class: { select: { teacherId: true } },
      worksheet: { select: { fields: { where: { id: input.fieldId }, select: { id: true, label: true } } } },
    },
  });
  if (!a) throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  const field = a.worksheet.fields[0];
  if (!field) throw new AppError("Không tìm thấy câu hỏi trong bài tập này.", 404, "NOT_FOUND");
  const groupIds = await getStudentGroupIds(studentId);
  const sub = await prisma.submission.findFirst({
    where: {
      assignmentId,
      status: { in: ["SUBMITTED", "GRADED"] },
      OR: [{ studentId }, ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : [])],
    },
    orderBy: { attemptNo: "desc" },
    select: { status: true },
  });
  if (!sub || !canRevealResult(a, sub.status)) {
    throw new AppError("Chỉ hỏi được sau khi đã nộp bài và xem được kết quả.", 403, "DOUBT_NOT_ALLOWED_YET");
  }
  const open = await prisma.questionDoubt.count({ where: { assignmentId, studentId, teacherReply: null } });
  if (open >= 10) throw new AppError("Bạn đang có quá nhiều câu hỏi chờ trả lời.", 429, "DOUBT_LIMIT");

  const doubt = await prisma.questionDoubt.create({
    data: { assignmentId, fieldId: field.id, studentId, question: input.question.trim().slice(0, 1000) },
  });
  await createNotificationsBulk([
    {
      userId: a.class.teacherId,
      type: "SYSTEM_ALERT",
      title: `Câu hỏi mới về câu ${field.label}: ${a.title}`.slice(0, 200),
      body: input.question.trim().slice(0, 300),
      link: `/teacher/assignments/${assignmentId}/grading?tab=doubts`,
    },
  ]);
  return { id: doubt.id };
}

/** Teachers see every doubt; a student sees their own plus replies the teacher made public. */
export async function listQuestionDoubts(assignmentId: string, viewer: Actor) {
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { classId: true } });
  if (!a) throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  let where: Prisma.QuestionDoubtWhereInput;
  let isTeacher = false;
  if (viewer.role === "STUDENT") {
    const enrolled = await prisma.enrollment.findUnique({
      where: { classId_studentId: { classId: a.classId, studentId: viewer.id } },
      select: { status: true },
    });
    if (enrolled?.status !== "ACTIVE") throw new AppError("Bạn không thuộc lớp được giao bài tập này.", 403, "FORBIDDEN");
    where = { assignmentId, OR: [{ studentId: viewer.id }, { isPublicToClass: true, teacherReply: { not: null } }] };
  } else {
    const role = await teacherRole(a.classId, viewer);
    if (!hasMinClassRole(role, "ASSISTANT")) throw new AppError("Bạn không có quyền quản lý bài tập này.", 403, "FORBIDDEN");
    isTeacher = true;
    where = { assignmentId };
  }
  const rows = await prisma.questionDoubt.findMany({
    where,
    orderBy: [{ teacherReply: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: {
      id: true,
      fieldId: true,
      question: true,
      teacherReply: true,
      repliedAt: true,
      isPublicToClass: true,
      createdAt: true,
      studentId: true,
      field: { select: { label: true } },
      student: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    fieldId: r.fieldId,
    fieldLabel: r.field.label,
    question: r.question,
    teacherReply: r.teacherReply,
    repliedAt: r.repliedAt?.toISOString() ?? null,
    isPublicToClass: r.isPublicToClass,
    createdAt: r.createdAt.toISOString(),
    mine: r.studentId === viewer.id,
    // classmates' names are hidden from students
    studentName: isTeacher || r.studentId === viewer.id ? r.student.name : null,
  }));
}

export async function replyQuestionDoubt(doubtId: string, actor: Actor, input: { reply: string; isPublicToClass: boolean }) {
  const d = await prisma.questionDoubt.findUnique({
    where: { id: doubtId },
    select: { id: true, studentId: true, teacherReply: true, assignment: { select: { id: true, classId: true, title: true } } },
  });
  if (!d) throw new AppError("Không tìm thấy câu hỏi.", 404, "NOT_FOUND");
  const role = await teacherRole(d.assignment.classId, actor);
  if (!hasMinClassRole(role, "ASSISTANT")) throw new AppError("Bạn không có quyền quản lý bài tập này.", 403, "FORBIDDEN");
  if (d.teacherReply) throw new AppError("Câu hỏi này đã được trả lời.", 409, "DOUBT_ALREADY_REPLIED");
  await prisma.questionDoubt.update({
    where: { id: doubtId },
    data: { teacherReply: input.reply.trim().slice(0, 2000), isPublicToClass: input.isPublicToClass, repliedById: actor.id, repliedAt: new Date() },
  });
  await createNotificationsBulk([
    {
      userId: d.studentId,
      type: "SYSTEM_ALERT",
      title: `Giáo viên đã trả lời câu hỏi của bạn: ${d.assignment.title}`.slice(0, 200),
      body: input.reply.trim().slice(0, 300),
      link: `/student/assignments/${d.assignment.id}/do`,
    },
  ]);
  return { ok: true };
}
