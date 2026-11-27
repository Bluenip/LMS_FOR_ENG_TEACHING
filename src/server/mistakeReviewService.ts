import type { SkillTag, WorksheetSubject } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveEffectiveAssignment } from "@/lib/assignment-effective";
import { canRevealResult } from "./submissionService";

export interface ReviewableMistakeDTO {
  answerId: string;
  submissionId: string;
  assignmentId: string;
  assignmentTitle: string;
  classId: string;
  className: string;
  worksheetTitle: string;
  subject: WorksheetSubject;
  fieldId: string;
  fieldType: string;
  skillTag: SkillTag | null;
  topicTag: string | null;
  prompt: string;
  options: unknown;
  studentValue: unknown;
  answerKey: unknown;
  explanation: string | null;
  submittedAt: string | null;
}

/**
 * Lists incorrect answers for a student strictly from assignments where:
 *  1) `canRevealResult` is true (respecting `AFTER_SUBMIT` / `AFTER_DUE` / `GRADED`),
 *  2) `assignment.showAnswerKey === true`, AND
 *  3) the student has no remaining attempts or the deadline has passed (`!canStillAttempt`),
 * guaranteeing zero answer-key leakage on active or unrevealed assessments.
 */
export async function listReviewableMistakesForStudent(
  studentId: string,
  filters?: {
    subject?: WorksheetSubject;
    skillTag?: SkillTag;
    limit?: number;
  }
): Promise<ReviewableMistakeDTO[]> {
  const now = new Date();
  const maxLimit = Math.max(1, Math.min(200, filters?.limit ?? 80));

  const submissions = await prisma.submission.findMany({
    where: {
      studentId,
      status: { in: ["SUBMITTED", "GRADED"] },
      assignment: {
        showAnswerKey: true,
        class: { deletedAt: null },
        ...(filters?.subject ? { worksheet: { subject: filters.subject } } : {}),
      },
    },
    orderBy: [{ submittedAt: "desc" }],
    include: {
      assignment: {
        include: {
          class: { select: { id: true, name: true } },
          worksheet: {
            select: { title: true, subject: true },
          },
          overrides: {
            where: { studentId },
          },
        },
      },
      answers: {
        where: { isCorrect: false },
        include: {
          field: {
            select: {
              id: true,
              type: true,
              prompt: true,
              options: true,
              answerKey: true,
              explanation: true,
              skillTag: true,
              topicTag: true,
              placement: true,
              order: true,
            },
          },
        },
      },
    },
  });

  // Count completed attempts per assignment for this student
  const attemptsCountByAsg = new Map<string, number>();
  for (const s of submissions) {
    attemptsCountByAsg.set(
      s.assignmentId,
      (attemptsCountByAsg.get(s.assignmentId) ?? 0) + 1
    );
  }

  const out: ReviewableMistakeDTO[] = [];
  const seenFieldSubmission = new Set<string>();

  for (const sub of submissions) {
    if (!canRevealResult(sub.assignment, sub.status, now)) {
      continue;
    }

    const override = sub.assignment.overrides[0] ?? null;
    const effective = resolveEffectiveAssignment(sub.assignment, override);
    const attemptsUsed = attemptsCountByAsg.get(sub.assignmentId) ?? 1;
    const dueEnded = Boolean(effective.dueAt && now > effective.dueAt);
    const canStillAttempt =
      !dueEnded &&
      (effective.maxAttempts === null || attemptsUsed < effective.maxAttempts);

    if (canStillAttempt) {
      continue;
    }

    for (const ans of sub.answers) {
      if (filters?.skillTag && ans.field.skillTag !== filters.skillTag) {
        continue;
      }
      const dedupeKey = `${sub.assignmentId}:${ans.fieldId}`;
      if (seenFieldSubmission.has(dedupeKey)) continue;
      seenFieldSubmission.add(dedupeKey);

      out.push({
        answerId: ans.id,
        submissionId: sub.id,
        assignmentId: sub.assignmentId,
        assignmentTitle: sub.assignment.title,
        classId: sub.assignment.class.id,
        className: sub.assignment.class.name,
        worksheetTitle: sub.assignment.worksheet.title,
        subject: sub.assignment.worksheet.subject,
        fieldId: ans.fieldId,
        fieldType: ans.field.type,
        skillTag: ans.field.skillTag,
        topicTag: ans.field.topicTag,
        prompt:
          ans.field.prompt?.trim() ||
          `${sub.assignment.worksheet.title} — Câu #${ans.field.order + 1}`,
        options: ans.field.options,
        studentValue: ans.value,
        answerKey: ans.field.answerKey,
        explanation: ans.field.explanation,
        submittedAt: sub.submittedAt?.toISOString() ?? null,
      });

      if (out.length >= maxLimit) return out;
    }
  }

  return out;
}
