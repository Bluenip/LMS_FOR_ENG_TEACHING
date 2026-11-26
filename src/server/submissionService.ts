import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { resolveEffectiveAssignment } from "@/lib/assignment-effective";
import { convertScoreToScale } from "@/lib/score-scale";
import {
  computeRubricTotal,
  gradeSubmission,
  isManualFieldType,
  isPhotoUploadAnswer,
  sanitizeDictationDetail,
  type AnswerValue,
  type GradingOptions,
  type RubricCriterion,
  type RubricScoreMap,
} from "@/lib/grading";
import { STUDENT_FIELD_SELECT } from "./worksheetService";
import { createNotificationsBulk } from "./notificationService";
import { invalidateLeaderboardCache } from "./leaderboardService";
import { verifySebHeaderIfNeeded } from "./assignmentService";
import { publishAssignmentLive } from "@/lib/proctor-bus";

function sanitizeAnswerValueForSubmission(submissionId: string, value: AnswerValue): AnswerValue {
  if (isPhotoUploadAnswer(value)) {
    const prefix = `submissions/${submissionId}/`;
    const safeFiles = value.files.filter(
      (f) => typeof f.key === "string" && !f.key.includes("..") && f.key.startsWith(prefix)
    );
    return {
      files: safeFiles,
      ...(typeof value.note === "string" ? { note: value.note } : {}),
    };
  }
  return value;
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function getServerDeadline(
  submission: { startedAt: Date },
  assignment: { timeLimitMin: number | null; dueAt: Date | null; allowLate: boolean }
): Date | null {
  const candidates: Date[] = [];
  if (assignment.timeLimitMin && assignment.timeLimitMin > 0) {
    candidates.push(new Date(submission.startedAt.getTime() + assignment.timeLimitMin * 60_000));
  }
  if (assignment.dueAt && !assignment.allowLate) {
    candidates.push(assignment.dueAt);
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((earliest, d) => (d < earliest ? d : earliest));
}

export function computeRemainingSeconds(
  submission: { startedAt: Date },
  assignment: { timeLimitMin: number | null; dueAt: Date | null; allowLate: boolean },
  now = new Date()
): number | null {
  const deadline = getServerDeadline(submission, assignment);
  if (!deadline) return null;
  return Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / 1000));
}

export function canRevealResult(
  assignment: { showResult: "NEVER" | "AFTER_SUBMIT" | "AFTER_DUE"; dueAt: Date | null },
  submissionStatus: "IN_PROGRESS" | "SUBMITTED" | "GRADED",
  now = new Date()
): boolean {
  if (submissionStatus === "IN_PROGRESS") return false;
  if (assignment.showResult === "NEVER") return false;
  if (assignment.showResult === "AFTER_SUBMIT") return true;
  if (assignment.showResult === "AFTER_DUE") {
    return Boolean(assignment.dueAt && now >= assignment.dueAt);
  }
  return false;
}

/**
 * Starts a new attempt or resumes an active IN_PROGRESS attempt for a student.
 * Strictly checks openAt, dueAt/allowLate, maxAttempts, and rulesAccepted for proctored exams.
 */
export async function startOrResumeSubmission(
  assignmentId: string,
  studentId: string,
  opts?: { rulesAccepted?: boolean; cameraConsent?: boolean; attemptToken?: string }
) {
  const now = new Date();

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      worksheet: {
        include: {
          pages: { orderBy: { pageIndex: "asc" } },
          fields: {
            select: STUDENT_FIELD_SELECT,
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (!assignment) {
    throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  }

  const override = await prisma.assignmentOverride.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
  });
  const effective = resolveEffectiveAssignment(assignment, override);
  const effectiveTiming = {
    dueAt: effective.dueAt,
    timeLimitMin: effective.timeLimitMin,
    allowLate: assignment.allowLate,
  };

  if (assignment.openAt && now < assignment.openAt) {
    throw new AppError("Bài tập chưa đến thời gian mở.", 403, "NOT_OPEN_YET");
  }

  const existingSubmissions = await prisma.submission.findMany({
    where: { assignmentId, studentId },
    orderBy: { attemptNo: "desc" },
    include: {
      answers: {
        select: { fieldId: true, value: true },
      },
    },
  });

  const inProgress = existingSubmissions.find((s) => s.status === "IN_PROGRESS");

  // If there is an active in-progress submission
  if (inProgress) {
    // Check if its server timer already expired -> auto-finalize it!
    const deadline = getServerDeadline(inProgress, effectiveTiming);
    if (deadline && now >= deadline) {
      const finalized = await finalizeSubmissionInternal(inProgress.id);
      return { submission: finalized, alreadySubmitted: true };
    }

    // Handle multi-session detection if proctoring enabled and token mismatches
    const incomingToken = opts?.attemptToken || crypto.randomUUID();
    const tokenChanged =
      assignment.proctorMode !== "OFF" &&
      inProgress.attemptToken &&
      opts?.attemptToken &&
      inProgress.attemptToken !== opts.attemptToken;

    const updated = await prisma.submission.update({
      where: { id: inProgress.id },
      data: {
        attemptToken: incomingToken,
        lastHeartbeatAt: now,
        ...(opts?.rulesAccepted && !inProgress.rulesAcceptedAt
          ? { rulesAcceptedAt: now }
          : {}),
        ...(opts?.cameraConsent && !inProgress.cameraConsentAt
          ? { cameraConsentAt: now }
          : {}),
      },
    });

    if (tokenChanged) {
      const student = await prisma.user.findUnique({
        where: { id: studentId },
        select: { name: true },
      });
      await prisma.proctorEvent.create({
        data: {
          submissionId: inProgress.id,
          type: "MULTI_SESSION",
          at: now,
          meta: { reason: "Phát hiện mở bài thi trên tab hoặc thiết bị thứ hai" },
        },
      });
      publishAssignmentLive({
        kind: "PROCTOR_EVENT",
        assignmentId,
        submissionId: inProgress.id,
        studentId,
        studentName: student?.name ?? "Học sinh",
        eventType: "MULTI_SESSION",
        violationCount: updated.violationCount,
        maxViolations: assignment.maxViolations,
        at: now.toISOString(),
      });
    }

    return { submission: updated, alreadySubmitted: false };
  }

  // Starting a brand-new attempt
  if (effective.dueAt && now > effective.dueAt && !assignment.allowLate) {
    throw new AppError("Đã quá hạn nộp bài tập này.", 403, "PAST_DUE");
  }

  if (effective.maxAttempts !== null && existingSubmissions.length >= effective.maxAttempts) {
    throw new AppError(
      `Bạn đã dùng hết ${effective.maxAttempts} lượt làm bài cho phép.`,
      403,
      "MAX_ATTEMPTS_REACHED"
    );
  }

  const requiresRules = assignment.proctorMode !== "OFF" || assignment.requireCamera;
  if (requiresRules && !opts?.rulesAccepted) {
    throw new AppError(
      "Bạn cần đọc và đồng ý nội quy phòng thi trước khi bắt đầu.",
      400,
      "RULES_NOT_ACCEPTED"
    );
  }

  if (assignment.requireCamera && !opts?.cameraConsent) {
    throw new AppError(
      "Bài thi yêu cầu kiểm tra và đồng ý bật camera AI trước khi bắt đầu.",
      400,
      "CAMERA_CONSENT_REQUIRED"
    );
  }

  const maxScore = assignment.worksheet.fields.reduce((sum, f) => sum + f.points, 0);

  // Shuffle only ANSWER_SHEET fields when assignment.shuffle = true
  let questionOrder: string[] | null = null;
  if (assignment.shuffle) {
    const answerSheetIds = assignment.worksheet.fields
      .filter((f) => f.placement === "ANSWER_SHEET")
      .map((f) => f.id);
    if (answerSheetIds.length > 1) {
      questionOrder = shuffleArray(answerSheetIds);
    }
  }

  const nextAttemptNo = (existingSubmissions[0]?.attemptNo ?? 0) + 1;
  const attemptToken = opts?.attemptToken || crypto.randomUUID();

  const created = await prisma.submission.create({
    data: {
      assignmentId,
      studentId,
      attemptNo: nextAttemptNo,
      status: "IN_PROGRESS",
      startedAt: now,
      maxScore: Math.round(maxScore * 100) / 100,
      questionOrder: questionOrder ? (questionOrder as Prisma.InputJsonValue) : undefined,
      rulesAcceptedAt: opts?.rulesAccepted ? now : null,
      cameraConsentAt: opts?.cameraConsent ? now : null,
      attemptToken,
      lastHeartbeatAt: now,
    },
  });

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { name: true },
  });
  publishAssignmentLive({
    kind: "SUBMISSION_STARTED",
    assignmentId,
    submissionId: created.id,
    studentId,
    studentName: student?.name ?? "Học sinh",
    status: "IN_PROGRESS",
    answeredCount: 0,
    totalQuestions: assignment.worksheet.fields.length,
    at: now.toISOString(),
  });

  return { submission: created, alreadySubmitted: false };
}

/**
 * Returns the full student doing/result payload with explicit select.
 * SECURITY GUARANTEE: NEVER returns `answerKey`, `gradingOpts`, or `explanation`
 * unless the submission is finalized AND assignment.showResult + assignment.showAnswerKey allow it!
 */
export async function getStudentAssignmentPayload(
  assignmentId: string,
  studentId: string,
  requestedSubmissionId?: string
) {
  const now = new Date();
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      classId: true,
      title: true,
      openAt: true,
      dueAt: true,
      timeLimitMin: true,
      maxAttempts: true,
      shuffle: true,
      showResult: true,
      showAnswerKey: true,
      allowLate: true,
      showLeaderboard: true,
      proctorMode: true,
      violationAction: true,
      maxViolations: true,
      requireFullscreen: true,
      blockCopyPaste: true,
      requireCamera: true,
      cameraEnforce: true,
      cameraSnapshots: true,
      audioMaxPlays: true,
      audioBlockPause: true,
      audioBlockSeek: true,
      oneQuestionPerPage: true,
      remindBeforeDue: true,
      scoreScale: true,
      weight: true,
      overrides: {
        where: { studentId },
        take: 1,
      },
      class: { select: { id: true, name: true } },
      worksheet: {
        select: {
          id: true,
          title: true,
          subject: true,
          instructions: true,
          passages: true,
          pdfFileKey: true,
          pageCount: true,
          pages: {
            select: { id: true, pageIndex: true, widthPt: true, heightPt: true },
            orderBy: { pageIndex: "asc" },
          },
          audios: {
            select: {
              id: true,
              title: true,
              durationSec: true,
              order: true,
            },
            orderBy: { order: "asc" },
          },
          fields: {
            select: STUDENT_FIELD_SELECT,
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (!assignment) {
    throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  }

  const submissions = await prisma.submission.findMany({
    where: { assignmentId, studentId },
    orderBy: { attemptNo: "desc" },
    select: {
      id: true,
      attemptNo: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      isLate: true,
      autoScore: true,
      manualScore: true,
      totalScore: true,
      maxScore: true,
      questionOrder: true,
      teacherComment: true,
      violationCount: true,
      lockedAt: true,
      attemptVersion: true,
      restartCount: true,
      rulesAcceptedAt: true,
      cameraConsentAt: true,
      attemptToken: true,
      answers: {
        select: {
          id: true,
          fieldId: true,
          value: true,
          isCorrect: true,
          score: true,
          teacherNote: true,
          gradeDetail: true,
          rubricScores: true,
        },
      },
      audioPlays: {
        select: {
          audioId: true,
        },
      },
    },
  });

  const effective = resolveEffectiveAssignment(assignment, assignment.overrides[0] ?? null);
  const effectiveAssignmentForTiming = {
    dueAt: effective.dueAt,
    timeLimitMin: effective.timeLimitMin,
    allowLate: assignment.allowLate,
    showResult: assignment.showResult,
  };

  const activeSubmission = requestedSubmissionId
    ? submissions.find((s) => s.id === requestedSubmissionId) ?? submissions[0] ?? null
    : submissions.find((s) => s.status === "IN_PROGRESS") ?? submissions[0] ?? null;

  // Auto-finalize if active in-progress attempt exceeded server timer
  if (activeSubmission && activeSubmission.status === "IN_PROGRESS") {
    const deadline = getServerDeadline(activeSubmission, effectiveAssignmentForTiming);
    if (deadline && now >= deadline) {
      await finalizeSubmissionInternal(activeSubmission.id);
      return getStudentAssignmentPayload(assignmentId, studentId, activeSubmission.id);
    }
  }

  const revealResult = activeSubmission
    ? canRevealResult(
        { showResult: assignment.showResult, dueAt: effective.dueAt },
        activeSubmission.status,
        now
      )
    : false;
  // Never reveal the answer key while the student can still start another attempt,
  // otherwise they could copy the key into the next attempt.
  const canStillAttempt =
    (effective.maxAttempts === null || submissions.length < effective.maxAttempts) &&
    (!effective.dueAt || now <= effective.dueAt || assignment.allowLate);
  const revealKey = revealResult && assignment.showAnswerKey && !canStillAttempt;

  // Fetch rubric only when revealResult is allowed, and answerKey/explanation only when revealKey is allowed
  const revealedKeysByFieldId: Record<
    string,
    { correctAnswer: unknown; explanation: string | null }
  > = {};
  const revealedRubricByFieldId: Record<string, RubricCriterion[]> = {};
  if (revealResult) {
    const extraFields = await prisma.field.findMany({
      where: { worksheetId: assignment.worksheet.id },
      select: {
        id: true,
        rubric: true,
        ...(revealKey ? { answerKey: true, explanation: true } : {}),
      },
    });
    for (const k of extraFields) {
      if (Array.isArray(k.rubric) && k.rubric.length > 0) {
        revealedRubricByFieldId[k.id] = k.rubric as unknown as RubricCriterion[];
      }
      if (revealKey && "answerKey" in k) {
        revealedKeysByFieldId[k.id] = {
          correctAnswer: k.answerKey,
          explanation: "explanation" in k && typeof k.explanation === "string" ? k.explanation : null,
        };
      }
    }
  }

  // Reorder ANSWER_SHEET fields according to submission.questionOrder if shuffled
  let orderedFields = [...assignment.worksheet.fields];
  if (activeSubmission?.questionOrder && Array.isArray(activeSubmission.questionOrder)) {
    const orderList = activeSubmission.questionOrder as string[];
    const orderMap = new Map(orderList.map((id, idx) => [id, idx]));
    const overlays = orderedFields.filter((f) => f.placement === "OVERLAY");
    const sheetFields = orderedFields
      .filter((f) => f.placement === "ANSWER_SHEET")
      .sort((a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999));
    orderedFields = [...overlays, ...sheetFields];
  }

  const audioPlayCounts: Record<string, number> = {};
  if (activeSubmission) {
    for (const p of activeSubmission.audioPlays) {
      audioPlayCounts[p.audioId] = (audioPlayCounts[p.audioId] ?? 0) + 1;
    }
  }

  const sanitizedSubmission = activeSubmission
    ? {
        id: activeSubmission.id,
        attemptNo: activeSubmission.attemptNo,
        status: activeSubmission.status,
        startedAt: activeSubmission.startedAt.toISOString(),
        submittedAt: activeSubmission.submittedAt?.toISOString() ?? null,
        isLate: activeSubmission.isLate,
        maxScore: activeSubmission.maxScore,
        totalScore: revealResult ? activeSubmission.totalScore : null,
        scaledScore:
          revealResult && activeSubmission.totalScore !== null
            ? convertScoreToScale(
                activeSubmission.totalScore,
                activeSubmission.maxScore,
                assignment.scoreScale
              )
            : null,
        autoScore: revealResult ? activeSubmission.autoScore : null,
        manualScore: revealResult ? activeSubmission.manualScore : null,
        teacherComment: revealResult ? activeSubmission.teacherComment : null,
        violationCount: activeSubmission.violationCount,
        lockedAt: activeSubmission.lockedAt?.toISOString() ?? null,
        attemptVersion: activeSubmission.attemptVersion,
        restartCount: activeSubmission.restartCount,
        rulesAcceptedAt: activeSubmission.rulesAcceptedAt?.toISOString() ?? null,
        cameraConsentAt: activeSubmission.cameraConsentAt?.toISOString() ?? null,
        attemptToken: activeSubmission.attemptToken,
        audioPlayCounts,
        remainingSeconds:
          activeSubmission.status === "IN_PROGRESS"
            ? computeRemainingSeconds(activeSubmission, effectiveAssignmentForTiming, now)
            : 0,
        answers: activeSubmission.answers.map((a) => ({
          fieldId: a.fieldId,
          value: a.value,
          isCorrect: revealResult ? a.isCorrect : null,
          score: revealResult ? a.score : null,
          teacherNote: revealResult ? a.teacherNote : null,
          gradeDetail: revealResult
            ? sanitizeDictationDetail(a.gradeDetail, revealKey)
            : null,
          rubricScores: revealResult ? (a.rubricScores as RubricScoreMap | null) : null,
        })),
      }
    : null;

  // Do not expose any exam content (questions, options, PDF, audio) until the student has actually
  // started an attempt; before that only metadata (title, question count, time limit) is returned.
  const contentUnlocked = submissions.length > 0;
  const { overrides, ...assignmentRest } = assignment;
  void overrides;

  return {
    serverNow: now.toISOString(),
    assignment: {
      ...assignmentRest,
      openAt: assignment.openAt?.toISOString() ?? null,
      dueAt: effective.dueAt?.toISOString() ?? null,
      timeLimitMin: effective.timeLimitMin,
      maxAttempts: effective.maxAttempts,
      hasOverride: effective.hasOverride,
      worksheet: {
        ...assignment.worksheet,
        subject: assignment.worksheet.subject,
        passages: contentUnlocked ? (assignment.worksheet.passages ?? []) : [],
        questionCount: assignment.worksheet.fields.length,
        audioCount: assignment.worksheet.audios.length,
        pdfFileKey: contentUnlocked ? assignment.worksheet.pdfFileKey : null,
        pages: contentUnlocked ? assignment.worksheet.pages : [],
        audios: contentUnlocked ? assignment.worksheet.audios : [],
        fields: (contentUnlocked ? orderedFields : []).map((f) => ({
          ...f,
          ...(revealResult && revealedRubricByFieldId[f.id]
            ? { rubric: revealedRubricByFieldId[f.id] }
            : {}),
          ...(revealKey && revealedKeysByFieldId[f.id]
            ? {
                revealedAnswer: revealedKeysByFieldId[f.id]!.correctAnswer,
                explanation: revealedKeysByFieldId[f.id]!.explanation,
              }
            : {}),
        })),
      },
    },
    submission: sanitizedSubmission,
    attemptsSummary: submissions.map((s) => ({
      id: s.id,
      attemptNo: s.attemptNo,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      submittedAt: s.submittedAt?.toISOString() ?? null,
      totalScore: canRevealResult(
        { showResult: assignment.showResult, dueAt: effective.dueAt },
        s.status,
        now
      )
        ? s.totalScore
        : null,
      maxScore: s.maxScore,
    })),
    revealResult,
    revealKey,
    canStartNewAttempt:
      submissions.every((s) => s.status !== "IN_PROGRESS") &&
      (effective.maxAttempts === null || submissions.length < effective.maxAttempts) &&
      (!effective.dueAt || now <= effective.dueAt || assignment.allowLate) &&
      (!assignment.openAt || now >= assignment.openAt),
  };
}

/**
 * Autosaves student answers.
 * Strictly rejects:
 * - Already SUBMITTED / GRADED
 * - Locked due to proctoring violation
 * - Stale attemptVersion (e.g., in-flight request after RESTART!)
 * - Server timer expired or past due (when !allowLate)
 */
export async function autosaveSubmissionAnswers(
  submissionId: string,
  studentId: string,
  input: {
    attemptVersion: number;
    attemptToken?: string;
    answers: Array<{ fieldId: string; value: AnswerValue }>;
  },
  headers?: Headers
) {
  const now = new Date();
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: {
        include: {
          worksheet: { select: { id: true, fields: { select: { id: true } } } },
        },
      },
      student: { select: { name: true } },
    },
  });

  if (!submission || submission.studentId !== studentId) {
    throw new AppError("Không tìm thấy bài làm.", 404, "NOT_FOUND");
  }

  if (headers) {
    verifySebHeaderIfNeeded(submission.assignment, headers);
  }

  if (submission.status !== "IN_PROGRESS") {
    throw new AppError("Bài làm đã nộp, không thể chỉnh sửa.", 409, "ALREADY_SUBMITTED");
  }

  if (submission.lockedAt) {
    throw new AppError("Bài làm đang bị khoá do vi phạm quy chế thi.", 423, "SUBMISSION_LOCKED");
  }

  // Reject stale autosave requests sent before a RESTART reset!
  if (input.attemptVersion !== submission.attemptVersion) {
    throw new AppError(
      "Phiên bài làm đã được đặt lại từ đầu. Đáp án cũ bị từ chối.",
      409,
      "STALE_ATTEMPT_VERSION"
    );
  }

  // Enforce server deadline (respecting per-student AssignmentOverride)
  const override = await prisma.assignmentOverride.findUnique({
    where: { assignmentId_studentId: { assignmentId: submission.assignmentId, studentId } },
  });
  const effective = resolveEffectiveAssignment(submission.assignment, override);
  const effectiveTiming = {
    dueAt: effective.dueAt,
    timeLimitMin: effective.timeLimitMin,
    allowLate: submission.assignment.allowLate,
  };
  const deadline = getServerDeadline(submission, effectiveTiming);
  if (deadline && now >= deadline) {
    await finalizeSubmissionInternal(submission.id);
    throw new AppError(
      "Đã hết thời gian làm bài. Hệ thống đã tự động nộp bài của bạn.",
      409,
      "TIME_EXPIRED"
    );
  }

  const validFieldIds = new Set(submission.assignment.worksheet.fields.map((f) => f.id));
  const validAnswers = input.answers
    .filter((a) => validFieldIds.has(a.fieldId))
    .map((a) => ({
      fieldId: a.fieldId,
      value: sanitizeAnswerValueForSubmission(submission.id, a.value),
    }));

  await prisma.$transaction(async (tx) => {
    for (const ans of validAnswers) {
      await tx.answer.upsert({
        where: {
          submissionId_fieldId: {
            submissionId: submission.id,
            fieldId: ans.fieldId,
          },
        },
        create: {
          submissionId: submission.id,
          fieldId: ans.fieldId,
          value: (ans.value ?? "") as Prisma.InputJsonValue,
        },
        update: {
          value: (ans.value ?? "") as Prisma.InputJsonValue,
        },
      });
    }
    await tx.submission.update({
      where: { id: submission.id },
      data: { lastHeartbeatAt: now },
    });
  });

  const answeredCount = await prisma.answer.count({
    where: {
      submissionId: submission.id,
      NOT: { value: { equals: "" } },
    },
  });

  publishAssignmentLive({
    kind: "HEARTBEAT",
    assignmentId: submission.assignmentId,
    submissionId: submission.id,
    studentId,
    studentName: submission.student.name,
    status: "IN_PROGRESS",
    answeredCount,
    totalQuestions: submission.assignment.worksheet.fields.length,
    violationCount: submission.violationCount,
    at: now.toISOString(),
  });

  return {
    savedAt: now.toISOString(),
    attemptVersion: submission.attemptVersion,
    remainingSeconds: computeRemainingSeconds(submission, effectiveTiming, now),
  };
}

/**
 * Finalizes and auto-grades a submission inside a transaction.
 * Used by student submit, timer auto-submit, proctoring AUTO_SUBMIT, and teacher FORCE_SUBMIT.
 */
export async function finalizeSubmissionInternal(
  submissionId: string,
  finalAnswers?: Array<{ fieldId: string; value: AnswerValue }>
) {
  const now = new Date();
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          parentLinksAsChild: {
            where: { verifiedAt: { not: null } },
            select: { parentId: true },
          },
        },
      },
      assignment: {
        include: {
          class: { select: { id: true, name: true } },
          worksheet: {
            include: {
              fields: { orderBy: { order: "asc" } },
            },
          },
        },
      },
      answers: true,
    },
  });

  if (!submission) {
    throw new AppError("Không tìm thấy bài làm.", 404, "NOT_FOUND");
  }

  if (submission.status !== "IN_PROGRESS") {
    return submission;
  }

  const fields = submission.assignment.worksheet.fields;
  const validFieldIds = new Set(fields.map((f) => f.id));

  // Merge existing stored answers + any final payload answers
  const answerMap: Record<string, AnswerValue> = {};
  for (const a of submission.answers) {
    answerMap[a.fieldId] = a.value as AnswerValue;
  }
  if (finalAnswers) {
    for (const a of finalAnswers) {
      if (validFieldIds.has(a.fieldId)) {
        answerMap[a.fieldId] = sanitizeAnswerValueForSubmission(submission.id, a.value);
      }
    }
  }

  const graded = gradeSubmission(
    fields.map((f) => ({
      id: f.id,
      type: f.type,
      points: f.points,
      answerKey: f.answerKey,
      gradingOpts: (f.gradingOpts as GradingOptions | null) ?? null,
    })),
    answerMap
  );

  // When finalized lazily after the server deadline (timer expired while the student was away),
  // record the deadline itself as the submit time: not the moment someone reopened the page.
  const override = await prisma.assignmentOverride.findUnique({
    where: {
      assignmentId_studentId: {
        assignmentId: submission.assignmentId,
        studentId: submission.studentId,
      },
    },
  });
  const effective = resolveEffectiveAssignment(submission.assignment, override);
  const effectiveTiming = {
    dueAt: effective.dueAt,
    timeLimitMin: effective.timeLimitMin,
    allowLate: submission.assignment.allowLate,
  };
  const deadline = getServerDeadline(submission, effectiveTiming);
  const effectiveSubmittedAt = deadline && now > deadline ? deadline : now;
  const isLate = Boolean(effective.dueAt && effectiveSubmittedAt > effective.dueAt);
  const newStatus = graded.hasManualFields ? "SUBMITTED" : "GRADED";
  const totalScore = graded.hasManualFields ? graded.autoScore : graded.autoScore;

  const updated = await prisma.$transaction(async (tx) => {
    // Claim the submission atomically so concurrent finalize calls (timer + submit button,
    // teacher FORCE_SUBMIT...) cannot grade/notify twice.
    const claimed = await tx.submission.updateMany({
      where: { id: submission.id, status: "IN_PROGRESS" },
      data: { status: newStatus },
    });
    if (claimed.count === 0) return null;

    for (const f of fields) {
      const val = answerMap[f.id];
      const res = graded.fieldResults[f.id] ?? { isCorrect: false, score: 0 };
      const gradeDetail = res.detail
        ? (res.detail as unknown as Prisma.InputJsonValue)
        : undefined;
      await tx.answer.upsert({
        where: { submissionId_fieldId: { submissionId: submission.id, fieldId: f.id } },
        create: {
          submissionId: submission.id,
          fieldId: f.id,
          value: (val ?? "") as Prisma.InputJsonValue,
          isCorrect: res.isCorrect,
          score: res.score,
          gradeDetail,
        },
        update: {
          value: (val ?? "") as Prisma.InputJsonValue,
          isCorrect: res.isCorrect,
          score: res.score,
          ...(gradeDetail !== undefined ? { gradeDetail } : {}),
        },
      });
    }

    return tx.submission.update({
      where: { id: submission.id },
      data: {
        status: newStatus,
        submittedAt: effectiveSubmittedAt,
        isLate,
        autoScore: graded.autoScore,
        manualScore: graded.hasManualFields ? null : 0,
        totalScore,
        maxScore: graded.maxScore,
        lockedAt: null,
      },
    });
  });

  if (!updated) {
    // Another request finalized it first
    return prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
  }

  invalidateLeaderboardCache(submission.assignment.classId);

  publishAssignmentLive({
    kind: "SUBMISSION_SUBMITTED",
    assignmentId: submission.assignmentId,
    submissionId: submission.id,
    studentId: submission.studentId,
    studentName: submission.student.name,
    status: newStatus,
    at: now.toISOString(),
  });

  // Notify linked parents when graded or late
  if (submission.student.parentLinksAsChild.length > 0) {
    // Respect the assignment's showResult setting: parents must not learn the score earlier than the student
    const scoreText = !canRevealResult(submission.assignment, newStatus, now)
      ? "Điểm sẽ được công bố theo cài đặt của giáo viên"
      : newStatus === "GRADED"
        ? `Điểm: ${totalScore}/${graded.maxScore}`
        : "Đang chờ giáo viên chấm phần tự luận / nộp ảnh";
    await createNotificationsBulk(
      submission.student.parentLinksAsChild.map((pl) => ({
        userId: pl.parentId,
        type: "PARENT_ALERT",
        title: `${submission.student.name} đã nộp bài${isLate ? " (Trễ hạn)" : ""}`,
        body: `${submission.assignment.title} — ${scoreText}`,
        link: `/parent?childId=${submission.studentId}`,
      }))
    );
  }

  return updated;
}

export async function submitByStudent(
  submissionId: string,
  studentId: string,
  input?: {
    attemptVersion?: number;
    answers?: Array<{ fieldId: string; value: AnswerValue }>;
  },
  headers?: Headers
) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { assignment: true },
  });
  if (!submission || submission.studentId !== studentId) {
    throw new AppError("Không tìm thấy bài làm.", 404, "NOT_FOUND");
  }
  if (headers) {
    verifySebHeaderIfNeeded(submission.assignment, headers);
  }
  if (submission.status !== "IN_PROGRESS") {
    throw new AppError("Bài làm đã được nộp trước đó.", 409, "ALREADY_SUBMITTED");
  }
  if (submission.lockedAt) {
    throw new AppError("Bài làm đang bị khoá. Không thể tự nộp.", 423, "SUBMISSION_LOCKED");
  }
  if (
    input?.attemptVersion !== undefined &&
    input.attemptVersion !== submission.attemptVersion
  ) {
    throw new AppError("Phiên làm bài đã bị đặt lại, vui lòng tải lại trang.", 409, "STALE_ATTEMPT_VERSION");
  }

  // Answers sent after the server deadline are ignored (only what was autosaved in time counts)
  const override = await prisma.assignmentOverride.findUnique({
    where: {
      assignmentId_studentId: {
        assignmentId: submission.assignmentId,
        studentId,
      },
    },
  });
  const effective = resolveEffectiveAssignment(submission.assignment, override);
  const deadline = getServerDeadline(submission, {
    dueAt: effective.dueAt,
    timeLimitMin: effective.timeLimitMin,
    allowLate: submission.assignment.allowLate,
  });
  const pastDeadline = Boolean(deadline && new Date() >= deadline);
  return finalizeSubmissionInternal(submissionId, pastDeadline ? undefined : input?.answers);
}

/**
 * Teacher review detail for a single student submission (includes answerKey, proctor timeline, PDF).
 */
export async function getSubmissionForTeacherReview(submissionId: string) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      student: { select: { id: true, name: true, email: true } },
      assignment: {
        include: {
          class: { select: { id: true, name: true } },
          worksheet: {
            include: {
              pages: { orderBy: { pageIndex: "asc" } },
              fields: { orderBy: { order: "asc" } },
              audios: { orderBy: { order: "asc" } },
            },
          },
        },
      },
      answers: true,
      proctorEvents: { orderBy: { at: "desc" } },
      audioPlays: { orderBy: { startedAt: "asc" } },
    },
  });

  if (!submission) {
    throw new AppError("Không tìm thấy bài làm.", 404, "NOT_FOUND");
  }

  return submission;
}

/**
 * Teacher manual grading for ESSAY fields and score overrides for any field.
 */
export async function saveTeacherManualGrading(
  submissionId: string,
  input: {
    teacherComment?: string | null;
    flagged?: boolean;
    grades: Array<{
      fieldId: string;
      score: number;
      isCorrect?: boolean | null;
      teacherNote?: string | null;
      rubricScores?: RubricScoreMap | null;
    }>;
  }
) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          parentLinksAsChild: {
            where: { verifiedAt: { not: null } },
            select: { parentId: true },
          },
        },
      },
      assignment: {
        include: {
          worksheet: { include: { fields: true } },
        },
      },
      answers: true,
    },
  });

  if (!submission) {
    throw new AppError("Không tìm thấy bài làm.", 404, "NOT_FOUND");
  }

  if (submission.status === "IN_PROGRESS") {
    throw new AppError(
      "Học sinh chưa nộp bài, chưa thể chấm điểm.",
      409,
      "SUBMISSION_IN_PROGRESS"
    );
  }

  const fieldsById = new Map(submission.assignment.worksheet.fields.map((f) => [f.id, f]));

  const updated = await prisma.$transaction(async (tx) => {
    for (const g of input.grades) {
      const field = fieldsById.get(g.fieldId);
      if (!field) continue;
      const rubricCriteria = Array.isArray(field.rubric)
        ? (field.rubric as unknown as RubricCriterion[])
        : [];
      let clampedScore = Math.max(0, Math.min(field.points, g.score));
      let rubricScoresData: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined = undefined;
      if (rubricCriteria.length > 0 && g.rubricScores) {
        const res = computeRubricTotal(rubricCriteria, g.rubricScores, field.points);
        clampedScore = res.total;
        rubricScoresData = res.clampedScores as unknown as Prisma.InputJsonValue;
      } else if (g.rubricScores === null) {
        rubricScoresData = Prisma.JsonNull;
      }
      const inferredCorrect =
        g.isCorrect !== undefined && g.isCorrect !== null
          ? g.isCorrect
          : clampedScore >= field.points && field.points > 0;

      await tx.answer.upsert({
        where: { submissionId_fieldId: { submissionId, fieldId: g.fieldId } },
        create: {
          submissionId,
          fieldId: g.fieldId,
          value: "",
          score: clampedScore,
          isCorrect: inferredCorrect,
          isOverridden: true,
          teacherNote: g.teacherNote ?? null,
          ...(rubricScoresData !== undefined ? { rubricScores: rubricScoresData } : {}),
        },
        update: {
          score: clampedScore,
          isCorrect: inferredCorrect,
          isOverridden: true,
          teacherNote: g.teacherNote ?? null,
          ...(rubricScoresData !== undefined ? { rubricScores: rubricScoresData } : {}),
        },
      });
    }

    const allAnswers = await tx.answer.findMany({ where: { submissionId } });
    const answerByField = new Map(allAnswers.map((a) => [a.fieldId, a]));

    let autoScore = 0;
    let manualScore = 0;
    let maxScore = 0;
    for (const f of submission.assignment.worksheet.fields) {
      maxScore += f.points;
      const ans = answerByField.get(f.id);
      const pts = ans?.score ?? 0;
      if (isManualFieldType(f.type)) {
        manualScore += pts;
      } else {
        autoScore += pts;
      }
    }

    const totalScore = Math.round((autoScore + manualScore) * 100) / 100;

    return tx.submission.update({
      where: { id: submissionId },
      data: {
        status: "GRADED",
        autoScore: Math.round(autoScore * 100) / 100,
        manualScore: Math.round(manualScore * 100) / 100,
        totalScore,
        maxScore: Math.round(maxScore * 100) / 100,
        ...(input.teacherComment !== undefined ? { teacherComment: input.teacherComment } : {}),
        ...(input.flagged !== undefined ? { flagged: input.flagged } : {}),
      },
    });
  });

  invalidateLeaderboardCache(submission.assignment.classId);

  // Notify student and linked parents about graded result
  // Respect showResult: do not leak the score via notifications before it may be shown
  const canShowScore = canRevealResult(submission.assignment, "GRADED");
  const scoreSuffix = canShowScore
    ? ` Điểm tổng: ${updated.totalScore}/${updated.maxScore}.`
    : " Điểm sẽ được công bố theo cài đặt của giáo viên.";
  const notifications: Array<{
    userId: string;
    type: "SUBMISSION_GRADED" | "PARENT_ALERT";
    title: string;
    body: string;
    link: string;
  }> = [
    {
      userId: submission.studentId,
      type: "SUBMISSION_GRADED",
      title: `Đã chấm bài: ${submission.assignment.title}`,
      body: `Giáo viên đã chấm bài của bạn.${scoreSuffix}`,
      link: `/student/assignments/${submission.assignmentId}/do`,
    },
  ];

  for (const pl of submission.student.parentLinksAsChild) {
    notifications.push({
      userId: pl.parentId,
      type: "PARENT_ALERT",
      title: `${submission.student.name} đã được chấm bài`,
      body: `${submission.assignment.title}.${scoreSuffix}`,
      link: `/parent?childId=${submission.studentId}`,
    });
  }

  await createNotificationsBulk(notifications);
  return updated;
}

/**
 * Grades a single field of a submission (used by the Grade-by-Question view).
 * Automatically marks the submission GRADED once every manual field has a score.
 */
export async function saveSingleFieldGrade(
  submissionId: string,
  input: {
    fieldId: string;
    score: number;
    isCorrect?: boolean | null;
    teacherNote?: string | null;
    rubricScores?: RubricScoreMap | null;
  }
) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          parentLinksAsChild: {
            where: { verifiedAt: { not: null } },
            select: { parentId: true },
          },
        },
      },
      assignment: {
        include: {
          worksheet: { include: { fields: true } },
        },
      },
    },
  });

  if (!submission) {
    throw new AppError("Không tìm thấy bài làm.", 404, "NOT_FOUND");
  }
  if (submission.status === "IN_PROGRESS") {
    throw new AppError(
      "Học sinh chưa nộp bài, chưa thể chấm điểm.",
      409,
      "SUBMISSION_IN_PROGRESS"
    );
  }

  const field = submission.assignment.worksheet.fields.find((f) => f.id === input.fieldId);
  if (!field) {
    throw new AppError("Không tìm thấy câu hỏi trong bài tập này.", 404, "NOT_FOUND");
  }

  const rubricCriteria = Array.isArray(field.rubric)
    ? (field.rubric as unknown as RubricCriterion[])
    : [];
  let clampedScore = Math.max(0, Math.min(field.points, input.score));
  let rubricScoresData: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined = undefined;
  if (rubricCriteria.length > 0 && input.rubricScores) {
    const res = computeRubricTotal(rubricCriteria, input.rubricScores, field.points);
    clampedScore = res.total;
    rubricScoresData = res.clampedScores as unknown as Prisma.InputJsonValue;
  } else if (input.rubricScores === null) {
    rubricScoresData = Prisma.JsonNull;
  }

  const inferredCorrect =
    input.isCorrect !== undefined && input.isCorrect !== null
      ? input.isCorrect
      : clampedScore >= field.points && field.points > 0;

  const updated = await prisma.$transaction(async (tx) => {
    const savedAnswer = await tx.answer.upsert({
      where: { submissionId_fieldId: { submissionId, fieldId: input.fieldId } },
      create: {
        submissionId,
        fieldId: input.fieldId,
        value: "",
        score: clampedScore,
        isCorrect: inferredCorrect,
        isOverridden: true,
        teacherNote: input.teacherNote ?? null,
        ...(rubricScoresData !== undefined ? { rubricScores: rubricScoresData } : {}),
      },
      update: {
        score: clampedScore,
        isCorrect: inferredCorrect,
        isOverridden: true,
        teacherNote: input.teacherNote ?? null,
        ...(rubricScoresData !== undefined ? { rubricScores: rubricScoresData } : {}),
      },
    });

    const allAnswers = await tx.answer.findMany({ where: { submissionId } });
    const answerByField = new Map(allAnswers.map((a) => [a.fieldId, a]));

    let autoScore = 0;
    let manualScore = 0;
    let maxScore = 0;
    let allManualGraded = true;
    for (const f of submission.assignment.worksheet.fields) {
      maxScore += f.points;
      const ans = answerByField.get(f.id);
      if (isManualFieldType(f.type)) {
        if (ans?.score === null || ans?.score === undefined) {
          allManualGraded = false;
        } else {
          manualScore += ans.score;
        }
      } else {
        autoScore += ans?.score ?? 0;
      }
    }

    const totalScore = Math.round((autoScore + manualScore) * 100) / 100;
    const nextStatus = allManualGraded ? "GRADED" : "SUBMITTED";

    const updatedSub = await tx.submission.update({
      where: { id: submissionId },
      data: {
        status: nextStatus,
        autoScore: Math.round(autoScore * 100) / 100,
        manualScore: allManualGraded ? Math.round(manualScore * 100) / 100 : null,
        totalScore,
        maxScore: Math.round(maxScore * 100) / 100,
      },
    });

    return { updatedSub, savedAnswer };
  });

  invalidateLeaderboardCache(submission.assignment.classId);

  if (submission.status !== "GRADED" && updated.updatedSub.status === "GRADED") {
    const canShowScore = canRevealResult(submission.assignment, "GRADED");
    const scoreSuffix = canShowScore
      ? ` Điểm tổng: ${updated.updatedSub.totalScore}/${updated.updatedSub.maxScore}.`
      : " Điểm sẽ được công bố theo cài đặt của giáo viên.";
    await createNotificationsBulk([
      {
        userId: submission.studentId,
        type: "SUBMISSION_GRADED",
        title: `Đã chấm bài: ${submission.assignment.title}`,
        body: `Giáo viên đã chấm bài của bạn.${scoreSuffix}`,
        link: `/student/assignments/${submission.assignmentId}/do`,
      },
      ...submission.student.parentLinksAsChild.map((pl) => ({
        userId: pl.parentId,
        type: "PARENT_ALERT" as const,
        title: `${submission.student.name} đã được chấm bài`,
        body: `${submission.assignment.title}.${scoreSuffix}`,
        link: `/parent?childId=${submission.studentId}`,
      })),
    ]);
  }

  return updated;
}
