import type {
  LeaderboardMode,
  ProctorMode,
  ShowResultMode,
  ViolationAction,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createNotificationsBulk } from "./notificationService";
import { canRevealResult } from "./submissionService";
import { formatDateTime } from "@/lib/utils";
import type { UpdateAssignmentInput } from "@/lib/validators";
import { logAudit } from "@/server/auditService";

export interface CreateAssignmentInput {
  worksheetId: string;
  classIds: string[];
  title: string;
  openAt?: string | null;
  dueAt?: string | null;
  timeLimitMin?: number | null;
  maxAttempts: number | null;
  shuffle: boolean;
  showResult: ShowResultMode;
  showAnswerKey: boolean;
  allowLate: boolean;
  showLeaderboard: LeaderboardMode;
  leaderboardAnon: boolean;
  leaderboardScoreRule: "BEST" | "LAST";
  proctorMode: ProctorMode;
  violationAction: ViolationAction;
  maxViolations: number;
  requireFullscreen: boolean;
  blockCopyPaste: boolean;
  sebConfigKeyHash?: string | null;
  shareProctorWithParent: boolean;
  requireCamera: boolean;
  cameraEnforce: boolean;
  cameraSnapshots: boolean;
  audioMaxPlays?: number | null;
  audioBlockPause: boolean;
  audioBlockSeek: boolean;
  oneQuestionPerPage?: boolean;
}

export async function createAssignmentsForClasses(
  teacherId: string,
  isAdmin: boolean,
  input: CreateAssignmentInput
) {
  const worksheet = await prisma.worksheet.findUnique({
    where: { id: input.worksheetId },
    include: { _count: { select: { fields: true } } },
  });
  if (!worksheet || worksheet.deletedAt) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }
  if (!isAdmin && worksheet.ownerId !== teacherId && !worksheet.isShared) {
    throw new AppError("Bạn không sở hữu phiếu bài tập này.", 403, "FORBIDDEN");
  }

  const classes = await prisma.class.findMany({
    where: {
      id: { in: input.classIds },
      deletedAt: null,
      ...(isAdmin ? {} : { teacherId }),
    },
    include: {
      enrollments: {
        where: { status: "ACTIVE" },
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
        },
      },
    },
  });

  if (classes.length !== input.classIds.length) {
    throw new AppError("Một hoặc nhiều lớp học không hợp lệ hoặc không thuộc quyền quản lý của bạn.", 403, "FORBIDDEN");
  }

  const openAt = input.openAt ? new Date(input.openAt) : null;
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;

  const createdAssignments = [];
  for (const cls of classes) {
    const assignment = await prisma.assignment.create({
      data: {
        classId: cls.id,
        worksheetId: worksheet.id,
        title: input.title,
        openAt,
        dueAt,
        timeLimitMin: input.timeLimitMin ?? null,
        maxAttempts: input.maxAttempts,
        shuffle: input.shuffle,
        showResult: input.showResult,
        showAnswerKey: input.showAnswerKey,
        allowLate: input.allowLate,
        showLeaderboard: input.showLeaderboard,
        leaderboardAnon: input.leaderboardAnon,
        leaderboardScoreRule: input.leaderboardScoreRule,
        proctorMode: input.proctorMode,
        violationAction: input.violationAction,
        maxViolations: input.maxViolations,
        requireFullscreen:
          input.proctorMode === "LOCKDOWN" ? true : input.requireFullscreen,
        blockCopyPaste:
          input.proctorMode === "LOCKDOWN" ? true : input.blockCopyPaste,
        sebConfigKeyHash: input.sebConfigKeyHash?.trim() || null,
        shareProctorWithParent: input.shareProctorWithParent,
        requireCamera: input.requireCamera,
        cameraEnforce: input.requireCamera ? input.cameraEnforce : false,
        cameraSnapshots: input.requireCamera ? input.cameraSnapshots : false,
        audioMaxPlays: input.audioMaxPlays ?? null,
        audioBlockPause: input.audioBlockPause,
        audioBlockSeek: input.audioBlockSeek,
        oneQuestionPerPage: Boolean(input.oneQuestionPerPage),
      },
    });
    createdAssignments.push(assignment);

    const notifications: Array<{
      userId: string;
      type: "ASSIGNMENT_CREATED" | "PARENT_ALERT";
      title: string;
      body: string;
      link: string;
    }> = [];

    const dueLabel = dueAt ? ` • Hạn nộp: ${formatDateTime(dueAt)}` : "";
    for (const enr of cls.enrollments) {
      notifications.push({
        userId: enr.studentId,
        type: "ASSIGNMENT_CREATED",
        title: `Bài tập mới: ${assignment.title}`,
        body: `Lớp ${cls.name}${dueLabel}`,
        link:
          assignment.proctorMode !== "OFF" || assignment.requireCamera
            ? `/student/assignments/${assignment.id}/rules`
            : `/student/assignments/${assignment.id}/do`,
      });
      for (const pl of enr.student.parentLinksAsChild) {
        notifications.push({
          userId: pl.parentId,
          type: "PARENT_ALERT",
          title: `${enr.student.name} có bài tập mới`,
          body: `${assignment.title} (${cls.name})${dueLabel}`,
          link: `/parent?childId=${enr.studentId}`,
        });
      }
    }
    await createNotificationsBulk(notifications);
  }

  return createdAssignments;
}

/** Settings of one assignment, for the edit form (teacher/admin of its class only — checked by the route). */
export async function getAssignmentSettings(id: string) {
  const a = await prisma.assignment.findUnique({
    where: { id },
    include: {
      class: { select: { id: true, name: true, _count: { select: { enrollments: true } } } },
      worksheet: { select: { id: true, title: true, _count: { select: { fields: true, audios: true } } } },
      _count: { select: { submissions: true } },
    },
  });
  if (!a) throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  return a;
}

/**
 * Edits an assignment that was already given (deadline, attempts, timing, proctoring…).
 * Worksheet and class stay the same; existing submissions are kept. Students in the class are
 * notified when the change gives them more time or more attempts.
 */
export async function updateAssignment(
  id: string,
  input: UpdateAssignmentInput,
  actorId?: string
) {
  const before = await prisma.assignment.findUnique({
    where: { id },
    select: { maxAttempts: true, dueAt: true, classId: true, title: true },
  });
  if (!before) throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");

  const openAt = input.openAt ? new Date(input.openAt) : null;
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (openAt && dueAt && dueAt <= openAt) {
    throw new AppError("Hạn nộp phải sau thời điểm mở bài.", 400, "VALIDATION_ERROR");
  }

  const updated = await prisma.assignment.update({
    where: { id },
    data: {
      title: input.title,
      openAt,
      dueAt,
      timeLimitMin: input.timeLimitMin ?? null,
      maxAttempts: input.maxAttempts,
      shuffle: input.shuffle,
      showResult: input.showResult,
      showAnswerKey: input.showAnswerKey,
      allowLate: input.allowLate,
      showLeaderboard: input.showLeaderboard,
      leaderboardAnon: input.leaderboardAnon,
      leaderboardScoreRule: input.leaderboardScoreRule,
      proctorMode: input.proctorMode,
      violationAction: input.violationAction,
      maxViolations: input.maxViolations,
      requireFullscreen: input.proctorMode === "LOCKDOWN" ? true : input.requireFullscreen,
      blockCopyPaste: input.proctorMode === "LOCKDOWN" ? true : input.blockCopyPaste,
      sebConfigKeyHash: input.sebConfigKeyHash?.trim() || null,
      shareProctorWithParent: input.shareProctorWithParent,
      requireCamera: input.requireCamera,
      cameraEnforce: input.requireCamera ? input.cameraEnforce : false,
      cameraSnapshots: input.requireCamera ? input.cameraSnapshots : false,
      audioMaxPlays: input.audioMaxPlays ?? null,
      audioBlockPause: input.audioBlockPause,
      audioBlockSeek: input.audioBlockSeek,
      oneQuestionPerPage: Boolean(input.oneQuestionPerPage),
    },
  });

  const moreAttempts =
    before.maxAttempts !== null &&
    (updated.maxAttempts === null || updated.maxAttempts > before.maxAttempts);
  const laterDue =
    before.dueAt !== null && (updated.dueAt === null || updated.dueAt > before.dueAt);
  if (moreAttempts || laterDue) {
    const enrollments = await prisma.enrollment.findMany({
      where: { classId: before.classId, status: "ACTIVE" },
      select: { studentId: true },
    });
    const parts = [
      moreAttempts
        ? updated.maxAttempts === null
          ? "Không giới hạn lượt làm"
          : `Được làm tối đa ${updated.maxAttempts} lượt`
        : null,
      laterDue ? (updated.dueAt ? `Hạn nộp mới: ${formatDateTime(updated.dueAt)}` : "Không còn hạn nộp") : null,
    ].filter(Boolean);
    await createNotificationsBulk(
      enrollments.map((e) => ({
        userId: e.studentId,
        type: "ASSIGNMENT_CREATED" as const,
        title: `Bài tập được cập nhật: ${updated.title}`,
        body: parts.join(" • "),
        link:
          updated.proctorMode !== "OFF" || updated.requireCamera
            ? `/student/assignments/${updated.id}/rules`
            : `/student/assignments/${updated.id}/do`,
      }))
    );
  }
  await logAudit({
    actorId: actorId ?? null,
    action: "ASSIGNMENT_UPDATED",
    targetType: "ASSIGNMENT",
    targetId: updated.id,
    summary: `Cập nhật bài tập đã giao: ${updated.title}`,
    summaryEn: `Updated assignment: ${updated.title}`,
    meta: {
      classId: updated.classId,
      previousTitle: before.title,
      title: updated.title,
      previousMaxAttempts: before.maxAttempts,
      maxAttempts: updated.maxAttempts,
      previousDueAt: before.dueAt?.toISOString() ?? null,
      dueAt: updated.dueAt?.toISOString() ?? null,
      timeLimitMin: updated.timeLimitMin,
      proctorMode: updated.proctorMode,
    },
  });

  return updated;
}

export async function listStudentAssignments(studentId: string) {
  const assignments = await prisma.assignment.findMany({
    where: {
      class: {
        archived: false,
        deletedAt: null,
        enrollments: {
          some: { studentId, status: "ACTIVE" },
        },
      },
    },
    include: {
      class: { select: { id: true, name: true, teacher: { select: { name: true } } } },
      worksheet: {
        select: {
          id: true,
          title: true,
          pageCount: true,
          _count: { select: { fields: true } },
        },
      },
      submissions: {
        where: { studentId },
        orderBy: { attemptNo: "desc" },
        select: {
          id: true,
          attemptNo: true,
          status: true,
          startedAt: true,
          submittedAt: true,
          isLate: true,
          totalScore: true,
          maxScore: true,
          lockedAt: true,
          violationCount: true,
        },
      },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
  });

  const now = new Date();
  return assignments.map((a) => ({
    ...a,
    submissions: a.submissions.map((s) => ({
      ...s,
      totalScore: canRevealResult(a, s.status, now) ? s.totalScore : null,
    })),
  }));
}

/** A teacher's own assignments; an admin (`allClasses`) sees every assignment in the system. */
export async function listTeacherAssignments(teacherId: string, opts?: { allClasses?: boolean }) {
  return prisma.assignment.findMany({
    where: opts?.allClasses ? { class: { deletedAt: null } } : { class: { teacherId, deletedAt: null } },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          teacherId: true,
          teacher: { select: { id: true, name: true } },
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
      },
      worksheet: {
        select: {
          id: true,
          title: true,
          _count: { select: { fields: true } },
        },
      },
      submissions: {
        select: {
          id: true,
          studentId: true,
          status: true,
          totalScore: true,
          maxScore: true,
          lockedAt: true,
          violationCount: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export { describeProctorRuleSummary } from "@/lib/proctor-helpers";

export function verifySebHeaderIfNeeded(
  assignment: { proctorMode: ProctorMode; sebConfigKeyHash: string | null },
  headers: Headers
): void {
  if (assignment.proctorMode !== "SEB") return;
  const incomingHash = headers.get("x-safeexambrowser-configkeyhash")?.trim();
  if (!incomingHash) {
    throw new AppError(
      "Bài thi này yêu cầu mở bằng Safe Exam Browser (thiếu header X-SafeExamBrowser-ConfigKeyHash).",
      403,
      "SEB_REQUIRED"
    );
  }
  if (assignment.sebConfigKeyHash && incomingHash !== assignment.sebConfigKeyHash.trim()) {
    throw new AppError(
      "Cấu hình Safe Exam Browser không khớp với bài thi này.",
      403,
      "SEB_HASH_MISMATCH"
    );
  }
}
