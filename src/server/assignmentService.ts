import crypto from "node:crypto";
import type {
  CameraSensitivity,
  LeaderboardMode,
  Prisma,
  ProctorMode,
  ScoreScale,
  ShowResultMode,
  ViolationAction,
  WorksheetSubject,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { resolveEffectiveAssignment } from "@/lib/assignment-effective";
import { detectImageMeta } from "@/lib/image-meta";
import { getStorageProvider } from "@/lib/storage";
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
  shuffleOptions?: boolean;
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
  cameraSensitivity?: CameraSensitivity;
  cameraCountLookAway?: boolean;
  requireMicMonitor?: boolean;
  audioMaxPlays?: number | null;
  audioBlockPause: boolean;
  audioBlockSeek: boolean;
  oneQuestionPerPage?: boolean;
  remindBeforeDue?: boolean;
  scoreScale?: ScoreScale;
  weight?: number;
  targetStudentIds?: string[] | null;
}

export async function createAssignmentsForClasses(
  teacherId: string,
  isAdmin: boolean,
  input: CreateAssignmentInput
) {
  if (input.targetStudentIds && input.targetStudentIds.length > 0 && input.classIds.length > 1) {
    throw new AppError(
      "Chỉ chọn được nhóm học sinh cụ thể khi giao cho 1 lớp duy nhất.",
      400,
      "VALIDATION_ERROR"
    );
  }

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
      ...(isAdmin
        ? {}
        : {
            OR: [
              { teacherId },
              {
                classTeachers: {
                  some: { userId: teacherId, role: { in: ["OWNER", "CO_TEACHER"] } },
                },
              },
            ],
          }),
    },
    include: {
      enrollments: {
        where: { status: "ACTIVE", student: { deletedAt: null } },
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
    const enrolledSet = new Set(cls.enrollments.map((e) => e.studentId));
    const requestedTargets =
      input.targetStudentIds && input.targetStudentIds.length > 0
        ? Array.from(new Set(input.targetStudentIds.filter((id) => enrolledSet.has(id))))
        : [];
    const targetSet = requestedTargets.length > 0 ? new Set(requestedTargets) : null;

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
        shuffleOptions: Boolean(input.shuffleOptions),
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
        cameraSensitivity: input.cameraSensitivity ?? "MEDIUM",
        cameraCountLookAway:
          input.requireCamera && input.cameraEnforce ? Boolean(input.cameraCountLookAway) : false,
        requireMicMonitor: Boolean(input.requireMicMonitor),
        audioMaxPlays: input.audioMaxPlays ?? null,
        audioBlockPause: input.audioBlockPause,
        audioBlockSeek: input.audioBlockSeek,
        oneQuestionPerPage: Boolean(input.oneQuestionPerPage),
        remindBeforeDue: input.remindBeforeDue ?? true,
        scoreScale: input.scoreScale ?? "SCALE_10",
        weight: input.weight ?? 1,
        ...(requestedTargets.length > 0
          ? { targets: { create: requestedTargets.map((studentId) => ({ studentId })) } }
          : {}),
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
    const recipients = targetSet
      ? cls.enrollments.filter((e) => targetSet.has(e.studentId))
      : cls.enrollments;

    for (const enr of recipients) {
      notifications.push({
        userId: enr.studentId,
        type: "ASSIGNMENT_CREATED",
        title: `Bài tập mới: ${assignment.title}`,
        body: `Lớp ${cls.name}${dueLabel}`,
        link:
          assignment.proctorMode !== "OFF" ||
          assignment.requireCamera ||
          assignment.requireMicMonitor
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
      class: {
        select: {
          id: true,
          name: true,
          _count: { select: { enrollments: { where: { status: "ACTIVE", student: { deletedAt: null } } } } },
          enrollments: {
            where: { status: "ACTIVE", student: { deletedAt: null } },
            select: { student: { select: { id: true, name: true, email: true } } },
            orderBy: { student: { name: "asc" } },
          },
        },
      },
      worksheet: { select: { id: true, title: true, subject: true, _count: { select: { fields: true, audios: true } } } },
      targets: { select: { studentId: true } },
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
  input: Omit<
    UpdateAssignmentInput,
    | "remindBeforeDue"
    | "scoreScale"
    | "weight"
    | "shuffleOptions"
    | "cameraSensitivity"
    | "cameraCountLookAway"
    | "requireMicMonitor"
  > & {
    remindBeforeDue?: boolean;
    scoreScale?: ScoreScale;
    weight?: number;
    shuffleOptions?: boolean;
    cameraSensitivity?: CameraSensitivity;
    cameraCountLookAway?: boolean;
    requireMicMonitor?: boolean;
  },
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
      ...(input.shuffleOptions !== undefined ? { shuffleOptions: Boolean(input.shuffleOptions) } : {}),
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
      ...(input.cameraSensitivity !== undefined
        ? { cameraSensitivity: input.cameraSensitivity }
        : {}),
      ...(input.cameraCountLookAway !== undefined
        ? {
            cameraCountLookAway:
              input.requireCamera && input.cameraEnforce
                ? Boolean(input.cameraCountLookAway)
                : false,
          }
        : input.requireCamera && input.cameraEnforce
          ? {}
          : { cameraCountLookAway: false }),
      ...(input.requireMicMonitor !== undefined
        ? { requireMicMonitor: Boolean(input.requireMicMonitor) }
        : {}),
      audioMaxPlays: input.audioMaxPlays ?? null,
      audioBlockPause: input.audioBlockPause,
      audioBlockSeek: input.audioBlockSeek,
      oneQuestionPerPage: Boolean(input.oneQuestionPerPage),
      ...(input.remindBeforeDue !== undefined ? { remindBeforeDue: input.remindBeforeDue } : {}),
      ...(input.scoreScale !== undefined ? { scoreScale: input.scoreScale } : {}),
      ...(input.weight !== undefined ? { weight: input.weight } : {}),
    },
  });

  let targetSet: Set<string> | null = null;
  if (input.targetStudentIds !== undefined) {
    const activeEnrollments = await prisma.enrollment.findMany({
      where: { classId: before.classId, status: "ACTIVE", student: { deletedAt: null } },
      select: { studentId: true },
    });
    const enrolledSet = new Set(activeEnrollments.map((e) => e.studentId));
    const validTargets = Array.isArray(input.targetStudentIds)
      ? Array.from(new Set(input.targetStudentIds.filter((sid) => enrolledSet.has(sid))))
      : [];
    await prisma.$transaction(async (tx) => {
      await tx.assignmentTarget.deleteMany({ where: { assignmentId: id } });
      if (validTargets.length > 0) {
        await tx.assignmentTarget.createMany({
          data: validTargets.map((studentId) => ({ assignmentId: id, studentId })),
        });
      }
    });
    targetSet = validTargets.length > 0 ? new Set(validTargets) : null;
  } else {
    const existingTargets = await prisma.assignmentTarget.findMany({
      where: { assignmentId: id },
      select: { studentId: true },
    });
    targetSet = existingTargets.length > 0 ? new Set(existingTargets.map((t) => t.studentId)) : null;
  }

  const moreAttempts =
    before.maxAttempts !== null &&
    (updated.maxAttempts === null || updated.maxAttempts > before.maxAttempts);
  const laterDue =
    before.dueAt !== null && (updated.dueAt === null || updated.dueAt > before.dueAt);
  if (moreAttempts || laterDue) {
    const enrollments = await prisma.enrollment.findMany({
      where: { classId: before.classId, status: "ACTIVE", student: { deletedAt: null } },
      select: { studentId: true },
    });
    const recipients = targetSet
      ? enrollments.filter((e) => targetSet.has(e.studentId))
      : enrollments;
    const parts = [
      moreAttempts
        ? updated.maxAttempts === null
          ? "Không giới hạn lượt làm"
          : `Được làm tối đa ${updated.maxAttempts} lượt`
        : null,
      laterDue ? (updated.dueAt ? `Hạn nộp mới: ${formatDateTime(updated.dueAt)}` : "Không còn hạn nộp") : null,
    ].filter(Boolean);
    await createNotificationsBulk(
      recipients.map((e) => ({
        userId: e.studentId,
        type: "ASSIGNMENT_CREATED" as const,
        title: `Bài tập được cập nhật: ${updated.title}`,
        body: parts.join(" • "),
        link:
          updated.proctorMode !== "OFF" || updated.requireCamera || updated.requireMicMonitor
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
      OR: [
        { targets: { none: {} } },
        { targets: { some: { studentId } } },
      ],
    },
    include: {
      class: { select: { id: true, name: true, teacher: { select: { name: true } } } },
      workbook: { select: { id: true, title: true } },
      worksheet: {
        select: {
          id: true,
          title: true,
          pageCount: true,
          _count: { select: { fields: true } },
        },
      },
      overrides: {
        where: { studentId },
        take: 1,
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

  const completedAssignmentIds = new Set(
    assignments
      .filter((a) => a.submissions.some((s) => s.status === "SUBMITTED" || s.status === "GRADED"))
      .map((a) => a.id)
  );

  const now = new Date();
  return assignments.map((a) => {
    const effective = resolveEffectiveAssignment(a, a.overrides[0] ?? null);
    const isLockedByPrerequisite = Boolean(
      a.unlockAfterAssignmentId && !completedAssignmentIds.has(a.unlockAfterAssignmentId)
    );
    return {
      ...a,
      dueAt: effective.dueAt,
      timeLimitMin: effective.timeLimitMin,
      maxAttempts: effective.maxAttempts,
      hasOverride: effective.hasOverride,
      isLockedByPrerequisite,
      submissions: a.submissions.map((s) => ({
        ...s,
        totalScore: canRevealResult(a, s.status, now) ? s.totalScore : null,
      })),
    };
  });
}

/** A teacher's own + co-taught assignments; an admin (`allClasses`) sees every assignment. */
export async function listTeacherAssignments(teacherId: string, opts?: { allClasses?: boolean }) {
  return prisma.assignment.findMany({
    where: opts?.allClasses
      ? { class: { deletedAt: null } }
      : {
          class: {
            deletedAt: null,
            OR: [
              { teacherId },
              { classTeachers: { some: { userId: teacherId } } },
            ],
          },
        },
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

export interface QuickAttachmentMeta {
  key: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

const MAX_QUICK_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export async function uploadQuickAssignmentAttachment(
  classId: string,
  file: { buffer: Buffer; originalName: string; mimeType: string }
): Promise<QuickAttachmentMeta> {
  if (file.buffer.byteLength <= 0 || file.buffer.byteLength > MAX_QUICK_ATTACHMENT_BYTES) {
    throw new AppError(
      "Kích thước file không hợp lệ hoặc vượt quá giới hạn.",
      400,
      "INVALID_FILE_SIZE"
    );
  }
  const img = detectImageMeta(file.buffer);
  let detected: { ext: string; mime: string } | null = img
    ? { ext: img.ext, mime: img.mime }
    : null;
  if (
    !detected &&
    file.buffer.byteLength >= 5 &&
    file.buffer.subarray(0, 5).toString("ascii") === "%PDF-"
  ) {
    detected = { ext: ".pdf", mime: "application/pdf" };
  }
  if (!detected) {
    throw new AppError(
      "Chỉ hỗ trợ ảnh (JPEG, PNG, WebP) hoặc file PDF hợp lệ.",
      400,
      "INVALID_FILE_TYPE"
    );
  }

  const key = `assignments/quick/${classId}/${crypto.randomUUID()}${detected.ext}`;
  const storage = getStorageProvider();
  await storage.put(key, file.buffer, detected.mime, {
    fileName: file.originalName,
  });

  return {
    key,
    name: file.originalName.trim().slice(0, 180) || `file${detected.ext}`,
    mimeType: detected.mime,
    sizeBytes: file.buffer.byteLength,
  };
}

export interface CreateQuickTextbookAssignmentInput {
  title: string;
  classIds: string[];
  promptText: string;
  openAt?: string | null;
  dueAt?: string | null;
  maxScore?: number;
  weight?: number;
  maxAttempts?: number | null;
  allowLate?: boolean;
  scoreScale?: ScoreScale;
  subject?: WorksheetSubject;
  attachmentKeys?: QuickAttachmentMeta[];
}

/**
 * Quickly assigns a textbook exercise: auto-creates a `[SGK]` worksheet with 1 PHOTO_UPLOAD
 * question carrying `promptText`, attaches optional PDF/image references, and creates an
 * Assignment for every selected class.
 */
export async function createQuickTextbookAssignment(
  teacherId: string,
  isAdmin: boolean,
  input: CreateQuickTextbookAssignmentInput
) {
  const uniqueClassIds = Array.from(new Set(input.classIds));
  const classes = await prisma.class.findMany({
    where: {
      id: { in: uniqueClassIds },
      deletedAt: null,
      ...(isAdmin
        ? {}
        : {
            OR: [
              { teacherId },
              {
                classTeachers: {
                  some: { userId: teacherId, role: { in: ["OWNER", "CO_TEACHER"] } },
                },
              },
            ],
          }),
    },
    include: {
      enrollments: {
        where: { status: "ACTIVE", student: { deletedAt: null } },
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

  if (classes.length !== uniqueClassIds.length) {
    throw new AppError(
      "Một hoặc nhiều lớp học không hợp lệ hoặc không thuộc quyền quản lý của bạn.",
      403,
      "FORBIDDEN"
    );
  }

  const verifiedClassIds = new Set(classes.map((c) => c.id));
  const attachments = input.attachmentKeys ?? [];
  for (const att of attachments) {
    const match = /^assignments\/quick\/([A-Za-z0-9_-]+)\/[A-Za-z0-9_.-]+$/.exec(att.key);
    if (!match || att.key.includes("..")) {
      throw new AppError(
        "Đính kèm bài tập không hợp lệ hoặc thuộc lớp khác.",
        400,
        "INVALID_ATTACHMENT"
      );
    }
    const keyClassId = match[1]!;
    if (!verifiedClassIds.has(keyClassId)) {
      if (!isAdmin) {
        const ownsUploadClass = await prisma.class.findFirst({
          where: {
            id: keyClassId,
            deletedAt: null,
            OR: [
              { teacherId },
              { classTeachers: { some: { userId: teacherId, role: { in: ["OWNER", "CO_TEACHER"] } } } },
            ],
          },
          select: { id: true },
        });
        if (!ownsUploadClass) {
          throw new AppError(
            "Đính kèm bài tập không hợp lệ hoặc thuộc lớp khác.",
            403,
            "FORBIDDEN"
          );
        }
      }
    }
  }

  const openAt = input.openAt ? new Date(input.openAt) : null;
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (openAt && dueAt && dueAt <= openAt) {
    throw new AppError("Hạn nộp phải sau thời điểm mở bài.", 400, "VALIDATION_ERROR");
  }

  const maxScore = input.maxScore ?? 10;
  const worksheetTitle = `[SGK] ${input.title}`.slice(0, 200);

  const worksheet = await prisma.worksheet.create({
    data: {
      ownerId: teacherId,
      title: worksheetTitle,
      subject: input.subject ?? "GENERAL",
      instructions: input.promptText,
      pageCount: 0,
      fields: {
        create: [
          {
            label: "1",
            type: "PHOTO_UPLOAD",
            placement: "ANSWER_SHEET",
            pageIndex: 0,
            order: 0,
            prompt: input.promptText,
            points: maxScore,
            answerKey: {} as Prisma.InputJsonValue,
          },
        ],
      },
    },
    include: { fields: true },
  });

  const createdAssignments = [];
  const dueLabel = dueAt ? ` • Hạn nộp: ${formatDateTime(dueAt)}` : "";

  for (const cls of classes) {
    const assignment = await prisma.assignment.create({
      data: {
        classId: cls.id,
        worksheetId: worksheet.id,
        title: input.title,
        isQuickTextbook: true,
        promptText: input.promptText,
        attachmentKeys: attachments as unknown as Prisma.InputJsonValue,
        openAt,
        dueAt,
        timeLimitMin: null,
        maxAttempts: input.maxAttempts !== undefined ? input.maxAttempts : 2,
        shuffle: false,
        shuffleOptions: false,
        showResult: "AFTER_SUBMIT",
        showAnswerKey: false,
        allowLate: input.allowLate ?? true,
        showLeaderboard: "OFF",
        leaderboardAnon: false,
        leaderboardScoreRule: "BEST",
        proctorMode: "OFF",
        violationAction: "WARN",
        maxViolations: 3,
        requireFullscreen: false,
        blockCopyPaste: false,
        shareProctorWithParent: false,
        requireCamera: false,
        cameraEnforce: false,
        cameraSnapshots: false,
        audioBlockPause: false,
        audioBlockSeek: false,
        oneQuestionPerPage: false,
        remindBeforeDue: true,
        scoreScale: input.scoreScale ?? "SCALE_10",
        weight: input.weight ?? 1,
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

    for (const enr of cls.enrollments) {
      notifications.push({
        userId: enr.studentId,
        type: "ASSIGNMENT_CREATED",
        title: `Bài tập mới: ${assignment.title}`,
        body: `Lớp ${cls.name}${dueLabel}`,
        link: `/student/assignments/${assignment.id}/do`,
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

  return { worksheet, assignments: createdAssignments };
}
