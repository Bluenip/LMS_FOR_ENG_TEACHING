import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { gradeSubmission } from "@/lib/grading";
import type { AnswerValue, GradingOptions } from "@/lib/grading/types";
import { STUDENT_FIELD_SELECT } from "@/server/worksheetService";

export async function toggleAssignmentPublicPractice(
  assignmentId: string,
  allowPublicPractice: boolean
) {
  const existing = await prisma.assignment.findFirst({
    where: { id: assignmentId, class: { deletedAt: null } },
    select: { id: true, publicShareToken: true, allowPublicPractice: true },
  });
  if (!existing) {
    throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  }

  let token = existing.publicShareToken;
  if (allowPublicPractice && !token) {
    token = crypto.randomBytes(12).toString("base64url");
  }

  return prisma.assignment.update({
    where: { id: assignmentId },
    data: {
      allowPublicPractice,
      ...(token ? { publicShareToken: token } : {}),
    },
    select: {
      id: true,
      title: true,
      allowPublicPractice: true,
      publicShareToken: true,
    },
  });
}

export async function listPublicPracticeAttempts(assignmentId: string) {
  const attempts = await prisma.publicAttempt.findMany({
    where: { assignmentId },
    orderBy: { submittedAt: "desc" },
    take: 100,
    select: {
      id: true,
      guestName: true,
      autoScore: true,
      maxScore: true,
      submittedAt: true,
    },
  });

  const avgScore =
    attempts.length > 0
      ? Number(
          (attempts.reduce((sum, a) => sum + a.autoScore, 0) / attempts.length).toFixed(2)
        )
      : null;

  return { attempts, count: attempts.length, avgScore };
}

export async function getPublicPracticeByToken(token: string) {
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new AppError("Liên kết luyện tập không hợp lệ.", 404, "NOT_FOUND");
  }

  const assignment = await prisma.assignment.findFirst({
    where: {
      publicShareToken: cleanToken,
      allowPublicPractice: true,
      class: { deletedAt: null },
      worksheet: { deletedAt: null },
    },
    select: {
      id: true,
      title: true,
      timeLimitMin: true,
      class: { select: { name: true } },
      worksheet: {
        select: {
          id: true,
          title: true,
          subject: true,
          instructions: true,
          passages: true,
          pageCount: true,
          pages: { orderBy: { pageIndex: "asc" } },
          audios: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, order: true, durationSec: true },
          },
          fields: {
            orderBy: [{ pageIndex: "asc" }, { order: "asc" }],
            select: STUDENT_FIELD_SELECT,
          },
        },
      },
    },
  });

  if (!assignment) {
    throw new AppError(
      "Liên kết luyện tập không tồn tại hoặc đã bị tắt bởi giáo viên.",
      404,
      "NOT_FOUND"
    );
  }

  return assignment;
}

export async function submitPublicPracticeAttempt(
  token: string,
  input: {
    guestName: string;
    answers: Array<{ fieldId: string; value?: unknown }> | Record<string, unknown>;
  }
) {
  const cleanToken = token.trim();
  const assignment = await prisma.assignment.findFirst({
    where: {
      publicShareToken: cleanToken,
      allowPublicPractice: true,
      class: { deletedAt: null },
      worksheet: { deletedAt: null },
    },
    select: {
      id: true,
      title: true,
      worksheet: {
        select: {
          fields: {
            orderBy: [{ pageIndex: "asc" }, { order: "asc" }],
            select: {
              id: true,
              type: true,
              points: true,
              options: true,
              answerKey: true,
              gradingOpts: true,
            },
          },
        },
      },
    },
  });

  if (!assignment) {
    throw new AppError(
      "Liên kết luyện tập không tồn tại hoặc đã bị tắt bởi giáo viên.",
      404,
      "NOT_FOUND"
    );
  }

  const answerLookup: Record<string, unknown> = Array.isArray(input.answers)
    ? Object.fromEntries(input.answers.map((a) => [a.fieldId, a.value]))
    : input.answers;

  const normalizedAnswers: Record<string, AnswerValue> = {};
  for (const field of assignment.worksheet.fields) {
    if (Object.prototype.hasOwnProperty.call(answerLookup, field.id)) {
      normalizedAnswers[field.id] = answerLookup[field.id] as AnswerValue;
    }
  }

  const graded = gradeSubmission(
    assignment.worksheet.fields.map((f) => ({
      id: f.id,
      type: f.type,
      points: f.points,
      options: f.options,
      answerKey: f.answerKey,
      gradingOpts: (f.gradingOpts as GradingOptions | null) ?? null,
    })),
    normalizedAnswers
  );

  const attempt = await prisma.publicAttempt.create({
    data: {
      assignmentId: assignment.id,
      guestName: input.guestName,
      answers: normalizedAnswers as unknown as Prisma.InputJsonValue,
      autoScore: graded.autoScore,
      maxScore: graded.maxScore,
    },
    select: {
      id: true,
      guestName: true,
      autoScore: true,
      maxScore: true,
      submittedAt: true,
    },
  });

  return {
    attemptId: attempt.id,
    guestName: attempt.guestName,
    autoScore: attempt.autoScore,
    maxScore: attempt.maxScore,
    submittedAt: attempt.submittedAt,
    hasManualFields: graded.hasManualFields,
    fieldResults: graded.fieldResults,
  };
}
