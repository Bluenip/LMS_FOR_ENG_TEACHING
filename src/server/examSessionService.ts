import type {
  ProctorMode,
  ScoreScale,
  ShowResultMode,
  ViolationAction,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Locale } from "@/lib/i18n/config";
import { computeScoreHistogram } from "@/lib/analytics/score-histogram";
import { compareQuestionLabels, formatDateTime } from "@/lib/utils";
import { createNotificationsBulk } from "./notificationService";
import { generateVariantsForAssignment } from "./examVariantService";
import { getAssignmentReport } from "./reportService";
import { getLiveProctoringSnapshot } from "./proctorService";

export interface CreateExamSessionInput {
  title: string;
  worksheetId: string;
  classIds: string[];
  openAt?: string | null;
  dueAt?: string | null;
  timeLimitMin?: number | null;
  maxAttempts?: number | null;
  variantCount?: number;
  showResult?: ShowResultMode;
  showAnswerKey?: boolean;
  allowLate?: boolean;
  proctorMode?: ProctorMode;
  violationAction?: ViolationAction;
  maxViolations?: number;
  requireFullscreen?: boolean;
  blockCopyPaste?: boolean;
  requireCamera?: boolean;
  cameraEnforce?: boolean;
  cameraSnapshots?: boolean;
  requireMicMonitor?: boolean;
  scoreScale?: ScoreScale;
  weight?: number;
}

export async function assertExamSessionAccess(
  examSessionId: string,
  userId: string,
  isAdmin: boolean
) {
  const session = await prisma.examSession.findUnique({
    where: { id: examSessionId },
    include: {
      worksheet: { select: { id: true, title: true } },
      assignments: {
        orderBy: { class: { name: "asc" } },
        include: {
          class: {
            select: {
              id: true,
              name: true,
              teacherId: true,
              deletedAt: true,
              classTeachers: { where: { userId }, select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!session) {
    throw new AppError("Không tìm thấy kỳ thi.", 404, "NOT_FOUND");
  }

  const authorized =
    isAdmin ||
    session.ownerId === userId ||
    session.assignments.some(
      (a) =>
        !a.class.deletedAt &&
        (a.class.teacherId === userId || a.class.classTeachers.length > 0)
    );

  if (!authorized) {
    throw new AppError("Bạn không có quyền xem kỳ thi này.", 403, "FORBIDDEN");
  }

  return session;
}

export async function listExamSessions(userId: string, isAdmin: boolean) {
  const sessions = await prisma.examSession.findMany({
    where: isAdmin
      ? {}
      : {
          OR: [
            { ownerId: userId },
            {
              assignments: {
                some: {
                  class: {
                    deletedAt: null,
                    OR: [{ teacherId: userId }, { classTeachers: { some: { userId } } }],
                  },
                },
              },
            },
          ],
        },
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { id: true, name: true } },
      worksheet: {
        select: { id: true, title: true, _count: { select: { fields: true } } },
      },
      assignments: {
        where: { class: { deletedAt: null } },
        include: {
          class: {
            select: {
              id: true,
              name: true,
              _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
            },
          },
          _count: {
            select: {
              submissions: true,
              examVariants: true,
            },
          },
        },
      },
    },
  });

  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    openAt: s.openAt?.toISOString() ?? null,
    dueAt: s.dueAt?.toISOString() ?? null,
    timeLimitMin: s.timeLimitMin,
    proctorConfig: s.proctorConfig,
    createdAt: s.createdAt.toISOString(),
    owner: s.owner,
    worksheet: {
      id: s.worksheet.id,
      title: s.worksheet.title,
      questionCount: s.worksheet._count.fields,
    },
    classCount: s.assignments.length,
    totalStudents: s.assignments.reduce((sum, a) => sum + a.class._count.enrollments, 0),
    totalSubmissions: s.assignments.reduce((sum, a) => sum + a._count.submissions, 0),
    variantCount: Math.max(0, ...s.assignments.map((a) => a._count.examVariants)),
    assignments: s.assignments.map((a) => ({
      id: a.id,
      classId: a.class.id,
      className: a.class.name,
      studentCount: a.class._count.enrollments,
      submissionCount: a._count.submissions,
      variantCount: a._count.examVariants,
    })),
  }));
}

export async function createExamSession(
  ownerId: string,
  isAdmin: boolean,
  input: CreateExamSessionInput
) {
  const worksheet = await prisma.worksheet.findUnique({
    where: { id: input.worksheetId },
    select: { id: true, ownerId: true, isShared: true, deletedAt: true },
  });
  if (!worksheet || worksheet.deletedAt) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }
  if (!isAdmin && worksheet.ownerId !== ownerId && !worksheet.isShared) {
    throw new AppError("Bạn không sở hữu phiếu bài tập này.", 403, "FORBIDDEN");
  }

  const uniqueClassIds = Array.from(new Set(input.classIds));
  const classes = await prisma.class.findMany({
    where: {
      id: { in: uniqueClassIds },
      deletedAt: null,
      ...(isAdmin
        ? {}
        : {
            OR: [
              { teacherId: ownerId },
              {
                classTeachers: {
                  some: { userId: ownerId, role: { in: ["OWNER", "CO_TEACHER"] } },
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

  const openAt = input.openAt ? new Date(input.openAt) : null;
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (openAt && dueAt && dueAt <= openAt) {
    throw new AppError("Hạn nộp phải sau thời điểm mở bài.", 400, "VALIDATION_ERROR");
  }

  const proctorMode: ProctorMode = input.proctorMode ?? "MONITOR";
  const violationAction: ViolationAction = input.violationAction ?? "WARN";
  const maxViolations = input.maxViolations ?? 3;
  const requireFullscreen = proctorMode === "LOCKDOWN" ? true : Boolean(input.requireFullscreen);
  const blockCopyPaste = proctorMode === "LOCKDOWN" ? true : input.blockCopyPaste ?? true;
  const requireCamera = Boolean(input.requireCamera);
  const cameraEnforce = requireCamera ? Boolean(input.cameraEnforce) : false;
  const cameraSnapshots = requireCamera ? input.cameraSnapshots ?? true : false;
  const requireMicMonitor = Boolean(input.requireMicMonitor);
  const variantCount = input.variantCount ?? 4;

  const proctorConfig = {
    proctorMode,
    violationAction,
    maxViolations,
    requireFullscreen,
    blockCopyPaste,
    requireCamera,
    cameraEnforce,
    cameraSnapshots,
    requireMicMonitor,
    variantCount,
  };

  const session = await prisma.examSession.create({
    data: {
      ownerId,
      title: input.title,
      worksheetId: worksheet.id,
      openAt,
      dueAt,
      timeLimitMin: input.timeLimitMin ?? null,
      proctorConfig: proctorConfig as unknown as Prisma.InputJsonValue,
    },
  });

  const createdAssignments = [];
  const dueLabel = dueAt ? ` • Hạn nộp: ${formatDateTime(dueAt)}` : "";

  for (const cls of classes) {
    const asg = await prisma.assignment.create({
      data: {
        classId: cls.id,
        worksheetId: worksheet.id,
        examSessionId: session.id,
        title: `${input.title} — ${cls.name}`,
        openAt,
        dueAt,
        timeLimitMin: input.timeLimitMin ?? null,
        maxAttempts: input.maxAttempts ?? 1,
        shuffle: variantCount > 1,
        shuffleOptions: variantCount > 1,
        showResult: input.showResult ?? "AFTER_DUE",
        showAnswerKey: Boolean(input.showAnswerKey),
        allowLate: Boolean(input.allowLate),
        showLeaderboard: "AFTER_DUE",
        leaderboardAnon: false,
        leaderboardScoreRule: "BEST",
        proctorMode,
        violationAction,
        maxViolations,
        requireFullscreen,
        blockCopyPaste,
        shareProctorWithParent: false,
        requireCamera,
        cameraEnforce,
        cameraSnapshots,
        requireMicMonitor,
        audioBlockPause: false,
        audioBlockSeek: false,
        oneQuestionPerPage: false,
        remindBeforeDue: true,
        scoreScale: input.scoreScale ?? "SCALE_10",
        weight: input.weight ?? 2,
      },
    });

    if (variantCount > 1) {
      await generateVariantsForAssignment(asg.id, variantCount);
    }

    createdAssignments.push(asg);

    const notifications: Array<{
      userId: string;
      type: "ASSIGNMENT_CREATED" | "PARENT_ALERT";
      title: string;
      body: string;
      link: string;
    }> = [];
    const targetPath =
      proctorMode !== "OFF" || requireCamera || requireMicMonitor
        ? `/student/assignments/${asg.id}/rules`
        : `/student/assignments/${asg.id}/do`;

    for (const enr of cls.enrollments) {
      notifications.push({
        userId: enr.studentId,
        type: "ASSIGNMENT_CREATED",
        title: `Kỳ thi mới: ${input.title}`,
        body: `Lớp ${cls.name}${dueLabel}`,
        link: targetPath,
      });
      for (const pl of enr.student.parentLinksAsChild) {
        notifications.push({
          userId: pl.parentId,
          type: "PARENT_ALERT",
          title: `${enr.student.name} có kỳ thi sắp diễn ra`,
          body: `${input.title} (${cls.name})${dueLabel}`,
          link: `/parent?childId=${enr.studentId}`,
        });
      }
    }
    await createNotificationsBulk(notifications);
  }

  return { session, assignments: createdAssignments };
}

export async function getExamSessionReport(
  examSessionId: string,
  userId: string,
  isAdmin: boolean,
  locale: Locale = "vi"
) {
  const session = await assertExamSessionAccess(examSessionId, userId, isAdmin);
  const activeAssignments = session.assignments.filter((a) => !a.class.deletedAt);

  const reports = await Promise.all(
    activeAssignments.map((a) => getAssignmentReport(a.id, locale))
  );

  const classComparisons = reports.map((r) => ({
    assignmentId: r.assignment.id,
    classId: r.assignment.classId,
    className: r.assignment.className,
    totalStudents: r.summary.totalStudents,
    submittedCount: r.summary.submittedCount,
    pendingManualCount: r.summary.pendingManualCount,
    avgScore10: r.summary.avgScore10,
    highestScore10: r.summary.highestScore10,
    lowestScore10: r.summary.lowestScore10,
    stdDev: r.summary.stdDev,
    variantCodes: r.assignment.examVariants ?? [],
  }));

  const studentRows = reports.flatMap((r) =>
    r.studentRows.map((row) => ({
      ...row,
      assignmentId: r.assignment.id,
      classId: r.assignment.classId,
      className: r.assignment.className,
    }))
  );

  const gradedScores10 = studentRows
    .filter((r) => r.status === "GRADED" && !r.flagged)
    .map((r) => r.scoreScale10)
    .filter((v): v is number => v !== null);

  const avgScore10 =
    gradedScores10.length > 0
      ? Math.round(
          (gradedScores10.reduce((s, v) => s + v, 0) / gradedScores10.length) * 100
        ) / 100
      : 0;
  const highestScore10 = gradedScores10.length > 0 ? Math.max(...gradedScores10) : 0;
  const lowestScore10 = gradedScores10.length > 0 ? Math.min(...gradedScores10) : 0;

  // Variant breakdown across all classes
  const variantAcc = new Map<string, { code: string; submissions: number; scores10: number[] }>();
  for (const row of studentRows) {
    if (row.status === "NOT_STARTED" || !row.examVariantCode) continue;
    const cur = variantAcc.get(row.examVariantCode) ?? {
      code: row.examVariantCode,
      submissions: 0,
      scores10: [],
    };
    cur.submissions += 1;
    if (row.status === "GRADED" && row.scoreScale10 !== null && !row.flagged) {
      cur.scores10.push(row.scoreScale10);
    }
    variantAcc.set(row.examVariantCode, cur);
  }
  const variantBreakdown = Array.from(variantAcc.values())
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map((v) => ({
      code: v.code,
      submissions: v.submissions,
      avgScore10:
        v.scores10.length > 0
          ? Math.round((v.scores10.reduce((s, n) => s + n, 0) / v.scores10.length) * 100) /
            100
          : null,
    }));

  // Aggregate per-question analytics across all classes by original fieldId
  const qAcc = new Map<
    string,
    {
      fieldId: string;
      label: string;
      type: string;
      skillTag: string | null;
      topicTag: string | null;
      points: number;
      correctCount: number;
      totalGraded: number;
    }
  >();
  for (const r of reports) {
    for (const q of r.questionAnalytics) {
      const cur = qAcc.get(q.fieldId) ?? {
        fieldId: q.fieldId,
        label: q.label,
        type: q.type,
        skillTag: q.skillTag,
        topicTag: q.topicTag ?? null,
        points: q.points,
        correctCount: 0,
        totalGraded: 0,
      };
      cur.correctCount += q.correctCount;
      cur.totalGraded += q.totalGraded;
      qAcc.set(q.fieldId, cur);
    }
  }
  const questionAnalytics = Array.from(qAcc.values())
    .sort((a, b) => compareQuestionLabels(a.label, b.label))
    .map((q) => ({
      ...q,
      correctRate: q.totalGraded > 0 ? Math.round((q.correctCount / q.totalGraded) * 100) : 0,
    }));

  return {
    session: {
      id: session.id,
      title: session.title,
      worksheetId: session.worksheet.id,
      worksheetTitle: session.worksheet.title,
      openAt: session.openAt?.toISOString() ?? null,
      dueAt: session.dueAt?.toISOString() ?? null,
      timeLimitMin: session.timeLimitMin,
      proctorConfig: session.proctorConfig,
      createdAt: session.createdAt.toISOString(),
    },
    classComparisons,
    overall: {
      totalStudents: studentRows.length,
      submittedCount: studentRows.filter(
        (r) => r.status === "SUBMITTED" || r.status === "GRADED"
      ).length,
      avgScore10,
      highestScore10,
      lowestScore10,
      histogram: computeScoreHistogram(gradedScores10),
      variantBreakdown,
    },
    questionAnalytics,
    studentRows,
  };
}

export async function getExamSessionLiveSnapshot(
  examSessionId: string,
  userId: string,
  isAdmin: boolean
) {
  const session = await assertExamSessionAccess(examSessionId, userId, isAdmin);
  const activeAssignments = session.assignments.filter((a) => !a.class.deletedAt);
  const snapshots = await Promise.all(
    activeAssignments.map((a) => getLiveProctoringSnapshot(a.id))
  );

  // Lookup assigned variant codes for submissions shown in live monitor
  const submissionIds = snapshots.flatMap((s) =>
    s.students.map((st) => st.submissionId).filter((id): id is string => Boolean(id))
  );
  const variantBySubId = new Map<string, string>();
  if (submissionIds.length > 0) {
    const subs = await prisma.submission.findMany({
      where: { id: { in: submissionIds }, examVariantId: { not: null } },
      select: { id: true, examVariant: { select: { code: true } } },
    });
    for (const sub of subs) {
      if (sub.examVariant?.code) variantBySubId.set(sub.id, sub.examVariant.code);
    }
  }

  const classes = snapshots.map((snap) => ({
    assignmentId: snap.assignment.id,
    classId: snap.assignment.classId,
    className: snap.assignment.className,
    counts: snap.counts,
  }));

  const totals = classes.reduce(
    (acc, c) => ({
      total: acc.total + c.counts.total,
      inProgress: acc.inProgress + c.counts.inProgress,
      submitted: acc.submitted + c.counts.submitted,
      leftTab: acc.leftTab + c.counts.leftTab,
      cameraOff: acc.cameraOff + c.counts.cameraOff,
      locked: acc.locked + c.counts.locked,
      notStarted: acc.notStarted + c.counts.notStarted,
    }),
    {
      total: 0,
      inProgress: 0,
      submitted: 0,
      leftTab: 0,
      cameraOff: 0,
      locked: 0,
      notStarted: 0,
    }
  );

  const students = snapshots.flatMap((snap) =>
    snap.students.map((st) => ({
      ...st,
      assignmentId: snap.assignment.id,
      classId: snap.assignment.classId,
      className: snap.assignment.className,
      examVariantCode: st.submissionId ? (variantBySubId.get(st.submissionId) ?? null) : null,
    }))
  );

  const recentEvents = snapshots
    .flatMap((snap) =>
      snap.recentEvents.map((ev) => ({
        ...ev,
        classId: snap.assignment.classId,
        className: snap.assignment.className,
      }))
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 60);

  return {
    sessionId: session.id,
    title: session.title,
    assignmentIds: activeAssignments.map((a) => a.id),
    classes,
    totals,
    students,
    recentEvents,
  };
}
