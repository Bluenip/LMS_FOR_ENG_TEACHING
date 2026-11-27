import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { computeRubricTotal, isManualFieldType, type RubricCriterion, type RubricScoreMap } from "@/lib/grading";
import { assignPeerReviewers } from "@/lib/peer-review/matcher";

const FINISHED = ["SUBMITTED", "GRADED", "RETURNED"] as const;

/** Creates anonymous reviewer ↔ submission pairs (no self-review, balanced load). Idempotent. */
export async function generatePeerReviewPairs(assignmentId: string) {
  const a = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { peerReviewEnabled: true, peerReviewsPerStudent: true },
  });
  if (!a) throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  if (!a.peerReviewEnabled) throw new AppError("Bài tập chưa bật chấm chéo.", 400, "PEER_REVIEW_DISABLED");
  const subs = await prisma.submission.findMany({
    where: { assignmentId, status: { in: [...FINISHED] } },
    orderBy: { attemptNo: "desc" },
    select: { id: true, studentId: true },
  });
  const pairs = assignPeerReviewers(subs.map((s) => ({ submissionId: s.id, studentId: s.studentId })), a.peerReviewsPerStudent);
  if (pairs.length === 0) throw new AppError("Cần ít nhất 2 bài đã nộp để chấm chéo.", 400, "PEER_REVIEW_NOT_ENOUGH");
  const res = await prisma.peerReviewAssignment.createMany({
    data: pairs.map((p) => ({ assignmentId, submissionId: p.submissionId, reviewerId: p.reviewerId })),
    skipDuplicates: true,
  });
  return { created: res.count, total: pairs.length };
}

async function manualFields(assignmentId: string) {
  const a = await prisma.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    select: { worksheet: { select: { fields: { orderBy: { order: "asc" }, select: { id: true, label: true, type: true, prompt: true, points: true, rubric: true } } } } },
  });
  return a.worksheet.fields.filter((f) => isManualFieldType(f.type) || f.type === "TEXT");
}

/**
 * Reviews the student has to do. The work is anonymised on the server: no name, e-mail or
 * student id of the author ever leaves this function.
 */
export async function getMyPeerReviews(assignmentId: string, reviewerId: string) {
  const [tasks, fields] = await Promise.all([
    prisma.peerReviewAssignment.findMany({
      where: { assignmentId, reviewerId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        rubricScores: true,
        comment: true,
        submittedAt: true,
        submission: { select: { answers: { select: { fieldId: true, value: true } } } },
      },
    }),
    manualFields(assignmentId),
  ]);
  const rubricField = fields.find((f) => Array.isArray(f.rubric) && (f.rubric as unknown[]).length > 0);
  return {
    rubric: (rubricField?.rubric as unknown as RubricCriterion[] | undefined) ?? [],
    reviews: tasks.map((t, i) => ({
      id: t.id,
      label: `Bài #${i + 1}`,
      submittedAt: t.submittedAt?.toISOString() ?? null,
      rubricScores: t.rubricScores,
      comment: t.comment,
      answers: fields.map((f) => ({
        fieldId: f.id,
        label: f.label,
        prompt: f.prompt,
        value: typeof t.submission.answers.find((a) => a.fieldId === f.id)?.value === "string"
          ? (t.submission.answers.find((a) => a.fieldId === f.id)!.value as string)
          : null,
      })),
    })),
  };
}

export async function submitPeerReview(
  peerReviewId: string,
  reviewerId: string,
  input: { rubricScores?: RubricScoreMap | null; comment?: string | null }
) {
  const pr = await prisma.peerReviewAssignment.findUnique({ where: { id: peerReviewId } });
  if (!pr || pr.reviewerId !== reviewerId) throw new AppError("Không tìm thấy lượt chấm chéo.", 404, "NOT_FOUND");
  const fields = await manualFields(pr.assignmentId);
  const rubricField = fields.find((f) => Array.isArray(f.rubric) && (f.rubric as unknown[]).length > 0);
  let scores: RubricScoreMap | null = null;
  if (rubricField && input.rubricScores) {
    scores = computeRubricTotal(rubricField.rubric as unknown as RubricCriterion[], input.rubricScores, rubricField.points).clampedScores;
  }
  const comment = input.comment?.trim().slice(0, 2000) || null;
  if (!comment && !scores) throw new AppError("Hãy nhập nhận xét hoặc chấm theo tiêu chí.", 400, "VALIDATION_ERROR");
  await prisma.peerReviewAssignment.update({
    where: { id: peerReviewId },
    data: { rubricScores: (scores ?? undefined) as Prisma.InputJsonValue | undefined, comment, submittedAt: new Date() },
  });
  return { ok: true };
}

/** Feedback the student received from classmates (reviewers stay anonymous). */
export async function getReceivedPeerFeedback(assignmentId: string, studentId: string) {
  const rows = await prisma.peerReviewAssignment.findMany({
    where: { assignmentId, submittedAt: { not: null }, submission: { studentId } },
    orderBy: { submittedAt: "asc" },
    select: { rubricScores: true, comment: true },
  });
  return rows.map((r, i) => ({ label: `Bạn #${i + 1}`, rubricScores: r.rubricScores, comment: r.comment }));
}

/** Teacher overview with real names (teacher only). */
export async function listPeerReviewsForTeacher(assignmentId: string) {
  const rows = await prisma.peerReviewAssignment.findMany({
    where: { assignmentId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      comment: true,
      rubricScores: true,
      submittedAt: true,
      reviewer: { select: { name: true } },
      submission: { select: { student: { select: { name: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    reviewerName: r.reviewer.name,
    authorName: r.submission.student.name,
    comment: r.comment,
    rubricScores: r.rubricScores,
    submittedAt: r.submittedAt?.toISOString() ?? null,
  }));
}
