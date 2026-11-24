import type { Prisma, ProctorEventType, ViolationAction } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { publishAssignmentLive } from "@/lib/proctor-bus";
import { createNotification } from "./notificationService";
import { computeRemainingSeconds, finalizeSubmissionInternal } from "./submissionService";
import { vi } from "@/messages/vi";
import { invalidateLeaderboardCache } from "./leaderboardService";

/**
 * Events that do NOT increment auto-enforcement violation count (heuristic / informational only).
 * Per PLAN.md 6C: "Phát hiện devtools chỉ là heuristic, có thể báo sai, nên chỉ hiển thị 'nghi vấn' và không tự khoá vì sự kiện này."
 */
const HEURISTIC_ONLY_EVENTS = new Set<ProctorEventType>([
  "DEVTOOLS_SUSPECTED",
  "NETWORK_OFFLINE",
]);

export interface RecordProctorEventResult {
  eventId: string;
  serverAt: string;
  violationCount: number;
  maxViolations: number;
  actionTaken: ViolationAction | null;
  locked: boolean;
  restarted: boolean;
  autoSubmitted: boolean;
  attemptVersion: number;
  clearedAnswersCount: number;
  status: string;
}

/**
 * Records a proctoring event with SERVER timestamp, increments server-side violationCount,
 * and enforces WARN / LOCK / RESTART / AUTO_SUBMIT inside the same Prisma transaction.
 * NEVER trusts violationCount from the client!
 */
export async function recordProctorEvent(
  submissionId: string,
  studentId: string,
  input: {
    type: ProctorEventType;
    durationMs?: number | null;
    clientAt?: string;
    meta?: Record<string, unknown>;
  }
): Promise<RecordProctorEventResult> {
  const serverNow = new Date();

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      student: { select: { id: true, name: true } },
      assignment: {
        select: {
          id: true,
          title: true,
          classId: true,
          proctorMode: true,
          violationAction: true,
          maxViolations: true,
        },
      },
    },
  });

  if (!submission || submission.studentId !== studentId) {
    throw new AppError("Không tìm thấy bài làm.", 404, "NOT_FOUND");
  }

  if (submission.status !== "IN_PROGRESS") {
    return {
      eventId: "",
      serverAt: serverNow.toISOString(),
      violationCount: submission.violationCount,
      maxViolations: submission.assignment.maxViolations,
      actionTaken: null,
      locked: Boolean(submission.lockedAt),
      restarted: false,
      autoSubmitted: false,
      attemptVersion: submission.attemptVersion,
      clearedAnswersCount: 0,
      status: submission.status,
    };
  }

  const isHeuristicOnly = HEURISTIC_ONLY_EVENTS.has(input.type);
  const enforceAction =
    !isHeuristicOnly &&
    submission.assignment.proctorMode !== "OFF";

  let shouldAutoSubmit = false;
  let clearedAnswersCount = 0;
  let actionTaken: ViolationAction | null = null;
  let locked = Boolean(submission.lockedAt);
  let restarted = false;

  const txResult = await prisma.$transaction(async (tx) => {
    const fresh = await tx.submission.findUniqueOrThrow({
      where: { id: submissionId },
    });

    const nextViolationCount = isHeuristicOnly
      ? fresh.violationCount
      : fresh.violationCount + 1;

    const thresholdReached =
      enforceAction &&
      nextViolationCount >= submission.assignment.maxViolations &&
      !fresh.lockedAt;

    let nextAttemptVersion = fresh.attemptVersion;
    let nextRestartCount = fresh.restartCount;
    let nextLockedAt = fresh.lockedAt;

    if (thresholdReached) {
      actionTaken = submission.assignment.violationAction;

      if (actionTaken === "LOCK") {
        nextLockedAt = serverNow;
        locked = true;
      } else if (actionTaken === "RESTART") {
        // Delete ALL answers for this attempt, bump attemptVersion so in-flight autosaves are rejected!
        // IMPORTANT: Do NOT reset `startedAt` so student cannot gain extra time!
        const deleted = await tx.answer.deleteMany({ where: { submissionId } });
        clearedAnswersCount = deleted.count;
        nextAttemptVersion = fresh.attemptVersion + 1;
        nextRestartCount = fresh.restartCount + 1;
        restarted = true;
      } else if (actionTaken === "AUTO_SUBMIT") {
        shouldAutoSubmit = true;
      }
    }

    const metaObj: Record<string, unknown> = {
      ...(input.meta ?? {}),
      ...(input.clientAt ? { clientAt: input.clientAt } : {}),
      ...(restarted ? { clearedAnswersCount } : {}),
      ...(actionTaken ? { actionTaken } : {}),
    };

    const event = await tx.proctorEvent.create({
      data: {
        submissionId,
        type: input.type,
        at: serverNow,
        durationMs: input.durationMs ?? null,
        meta: metaObj as Prisma.InputJsonValue,
      },
    });

    const updatedSub = await tx.submission.update({
      where: { id: submissionId },
      data: {
        violationCount: nextViolationCount,
        lockedAt: nextLockedAt,
        attemptVersion: nextAttemptVersion,
        restartCount: nextRestartCount,
      },
    });

    return { event, updatedSub };
  });

  let finalStatus: string = txResult.updatedSub.status;
  if (shouldAutoSubmit) {
    const finalized = await finalizeSubmissionInternal(submissionId);
    finalStatus = finalized.status;
  }

  // Build clear teacher alert message per PLAN.md 6C
  const eventLabel = vi.proctor.events[input.type] ?? input.type;
  const durStr =
    input.durationMs && input.durationMs >= 1000
      ? ` (${Math.round(input.durationMs / 1000)} giây)`
      : "";
  let alertMsg = `${submission.student.name}: ${eventLabel}${durStr}`;
  if (locked && actionTaken === "LOCK") {
    alertMsg = `${submission.student.name} ${eventLabel.toLowerCase()}${durStr}, bài đã bị khoá`;
  } else if (restarted) {
    alertMsg = `${submission.student.name} ${eventLabel.toLowerCase()}${durStr}, bài bị làm lại từ đầu (mất ${clearedAnswersCount} câu)`;
  } else if (shouldAutoSubmit) {
    alertMsg = `${submission.student.name} vượt ngưỡng vi phạm, hệ thống đã tự nộp bài`;
  }

  const kind =
    locked && actionTaken === "LOCK"
      ? "SUBMISSION_LOCKED"
      : restarted
        ? "SUBMISSION_RESTARTED"
        : shouldAutoSubmit
          ? "SUBMISSION_SUBMITTED"
          : "PROCTOR_EVENT";

  publishAssignmentLive({
    kind,
    assignmentId: submission.assignmentId,
    submissionId,
    studentId,
    studentName: submission.student.name,
    eventType: input.type,
    durationMs: input.durationMs ?? null,
    violationCount: txResult.updatedSub.violationCount,
    maxViolations: submission.assignment.maxViolations,
    actionTaken,
    clearedAnswersCount,
    status: finalStatus as "IN_PROGRESS" | "SUBMITTED" | "GRADED",
    message: alertMsg,
    at: serverNow.toISOString(),
  });

  return {
    eventId: txResult.event.id,
    serverAt: serverNow.toISOString(),
    violationCount: txResult.updatedSub.violationCount,
    maxViolations: submission.assignment.maxViolations,
    actionTaken,
    locked,
    restarted,
    autoSubmitted: shouldAutoSubmit,
    attemptVersion: txResult.updatedSub.attemptVersion,
    clearedAnswersCount,
    status: finalStatus,
  };
}

/**
 * Teacher live proctoring actions: UNLOCK, LOCK, FORCE_SUBMIT, REMIND, FLAG, UNFLAG
 */
export async function performTeacherProctorAction(
  assignmentId: string,
  submissionId: string,
  teacherId: string,
  input: {
    action: "UNLOCK" | "LOCK" | "FORCE_SUBMIT" | "REMIND" | "FLAG" | "UNFLAG";
    message?: string;
  }
) {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, assignmentId },
    include: {
      student: { select: { id: true, name: true } },
      assignment: { select: { id: true, title: true, classId: true } },
    },
  });
  if (!submission) {
    throw new AppError("Không tìm thấy bài làm trong ca thi này.", 404, "NOT_FOUND");
  }
  if (
    (input.action === "LOCK" || input.action === "UNLOCK" || input.action === "FORCE_SUBMIT") &&
    submission.status !== "IN_PROGRESS"
  ) {
    throw new AppError("Bài làm đã nộp, không thể khoá/mở khoá/thu bài.", 409, "ALREADY_SUBMITTED");
  }

  const now = new Date();

  switch (input.action) {
    case "UNLOCK": {
      const updated = await prisma.submission.update({
        where: { id: submission.id },
        data: { lockedAt: null, unlockedById: teacherId },
      });
      await createNotification({
        userId: submission.studentId,
        type: "PROCTOR_REMINDER",
        title: "Giáo viên đã mở khoá bài thi",
        body: `Bài "${submission.assignment.title}" đã được mở khoá. Bạn có thể tiếp tục làm bài.`,
        link: `/student/assignments/${assignmentId}/do`,
      });
      publishAssignmentLive({
        kind: "SUBMISSION_UNLOCKED",
        assignmentId,
        submissionId: submission.id,
        studentId: submission.studentId,
        studentName: submission.student.name,
        message: `Đã mở khoá bài cho ${submission.student.name}`,
        at: now.toISOString(),
      });
      return updated;
    }

    case "LOCK": {
      const updated = await prisma.submission.update({
        where: { id: submission.id },
        data: { lockedAt: now },
      });
      publishAssignmentLive({
        kind: "SUBMISSION_LOCKED",
        assignmentId,
        submissionId: submission.id,
        studentId: submission.studentId,
        studentName: submission.student.name,
        message: `Giáo viên đã khoá bài của ${submission.student.name}`,
        at: now.toISOString(),
      });
      return updated;
    }

    case "FORCE_SUBMIT": {
      return finalizeSubmissionInternal(submission.id);
    }

    case "REMIND": {
      const msg =
        input.message?.trim() ||
        "Giáo viên nhắc nhở: Vui lòng tập trung làm bài và không rời màn hình thi.";
      await createNotification({
        userId: submission.studentId,
        type: "PROCTOR_REMINDER",
        title: `Nhắc nhở từ giáo viên (${submission.assignment.title})`,
        body: msg,
        link: `/student/assignments/${assignmentId}/do`,
      });
      publishAssignmentLive({
        kind: "TEACHER_REMINDER",
        assignmentId,
        submissionId: submission.id,
        studentId: submission.studentId,
        studentName: submission.student.name,
        message: msg,
        at: now.toISOString(),
      });
      return submission;
    }

    case "FLAG":
    case "UNFLAG": {
      const updated = await prisma.submission.update({
        where: { id: submission.id },
        data: { flagged: input.action === "FLAG" },
      });
      // flagged submissions are excluded from leaderboards: refresh immediately
      invalidateLeaderboardCache(submission.assignment.classId);
      return updated;
    }
  }
}

/**
 * Snapshot for Teacher Live Proctoring screen (/teacher/assignments/[id]/live).
 */
export async function getLiveProctoringSnapshot(assignmentId: string) {
  const now = new Date();
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      class: {
        include: {
          enrollments: {
            where: { status: "ACTIVE" },
            include: { student: { select: { id: true, name: true, email: true } } },
            orderBy: { student: { name: "asc" } },
          },
        },
      },
      worksheet: {
        select: { id: true, title: true, _count: { select: { fields: true } } },
      },
      submissions: {
        orderBy: { attemptNo: "desc" },
        include: {
          student: { select: { id: true, name: true } },
          answers: { select: { fieldId: true, value: true } },
          proctorEvents: { orderBy: { at: "desc" }, take: 20 },
        },
      },
    },
  });

  if (!assignment) {
    throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  }

  const totalQuestions = assignment.worksheet._count.fields;
  const latestSubByStudent = new Map<string, (typeof assignment.submissions)[number]>();
  for (const sub of assignment.submissions) {
    if (!latestSubByStudent.has(sub.studentId)) {
      latestSubByStudent.set(sub.studentId, sub);
    }
  }

  const viCollator = new Intl.Collator("vi", { sensitivity: "base" });
  const students = [...assignment.class.enrollments]
    .sort((a, b) => viCollator.compare(a.student.name, b.student.name))
    .map((enr) => {
    const sub = latestSubByStudent.get(enr.studentId);
    const answeredCount = sub
      ? sub.answers.filter((a) => {
          if (a.value === null || a.value === undefined) return false;
          if (typeof a.value === "string") return a.value.trim().length > 0;
          if (Array.isArray(a.value)) return a.value.length > 0;
          return true;
        }).length
      : 0;

    const latestEvent = sub?.proctorEvents[0] ?? null;
    const recentlyLeft =
      latestEvent &&
      (latestEvent.type === "TAB_HIDDEN" ||
        latestEvent.type === "FULLSCREEN_EXIT" ||
        latestEvent.type === "WINDOW_BLUR") &&
      now.getTime() - latestEvent.at.getTime() < 30_000 &&
      sub?.status === "IN_PROGRESS" &&
      !sub?.lockedAt;

    let liveStatus: "NOT_STARTED" | "IN_PROGRESS" | "LEFT_TAB" | "LOCKED" | "SUBMITTED" =
      "NOT_STARTED";
    if (sub) {
      if (sub.status !== "IN_PROGRESS") liveStatus = "SUBMITTED";
      else if (sub.lockedAt) liveStatus = "LOCKED";
      else if (recentlyLeft) liveStatus = "LEFT_TAB";
      else liveStatus = "IN_PROGRESS";
    }

    return {
      studentId: enr.student.id,
      studentName: enr.student.name,
      studentEmail: enr.student.email,
      submissionId: sub?.id ?? null,
      liveStatus,
      answeredCount,
      totalQuestions,
      violationCount: sub?.violationCount ?? 0,
      restartCount: sub?.restartCount ?? 0,
      flagged: sub?.flagged ?? false,
      lockedAt: sub?.lockedAt?.toISOString() ?? null,
      remainingSeconds:
        sub && sub.status === "IN_PROGRESS"
          ? computeRemainingSeconds(sub, assignment, now)
          : null,
      events: (sub?.proctorEvents ?? []).map((ev) => ({
        id: ev.id,
        type: ev.type,
        at: ev.at.toISOString(),
        durationMs: ev.durationMs,
        meta: ev.meta,
      })),
    };
  });

  const recentEvents = assignment.submissions
    .flatMap((sub) =>
      sub.proctorEvents.map((ev) => ({
        id: ev.id,
        submissionId: sub.id,
        studentId: sub.studentId,
        studentName: sub.student.name,
        type: ev.type,
        at: ev.at.toISOString(),
        durationMs: ev.durationMs,
        meta: ev.meta,
      }))
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 50);

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      classId: assignment.classId,
      className: assignment.class.name,
      proctorMode: assignment.proctorMode,
      violationAction: assignment.violationAction,
      maxViolations: assignment.maxViolations,
      timeLimitMin: assignment.timeLimitMin,
      dueAt: assignment.dueAt?.toISOString() ?? null,
      totalQuestions,
    },
    counts: {
      total: students.length,
      inProgress: students.filter((s) => s.liveStatus === "IN_PROGRESS").length,
      submitted: students.filter((s) => s.liveStatus === "SUBMITTED").length,
      leftTab: students.filter((s) => s.liveStatus === "LEFT_TAB").length,
      locked: students.filter((s) => s.liveStatus === "LOCKED").length,
      notStarted: students.filter((s) => s.liveStatus === "NOT_STARTED").length,
    },
    students,
    recentEvents,
  };
}
