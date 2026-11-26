import type { SkillTag } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { normalizeToScale10, round2 } from "@/lib/gradebook-calc";
import { generateParentInviteCode } from "@/lib/utils";
import { canRevealResult } from "./submissionService";
import { getClassSemesterLeaderboard } from "./leaderboardService";

const DISPLAY_SKILLS: SkillTag[] = [
  "GRAMMAR",
  "VOCABULARY",
  "READING",
  "LISTENING",
  "WRITING",
];

/**
 * Generates an 8-character single-use ParentInviteCode valid for 7 days.
 */
export async function createParentInviteCodeForStudent(studentId: string) {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { id: true, role: true },
  });
  if (!student || student.role !== "STUDENT") {
    throw new AppError("Chỉ tạo được mã liên kết phụ huynh cho tài khoản học sinh.", 400, "INVALID_STUDENT");
  }

  let code = "";
  for (let i = 0; i < 10; i++) {
    const candidate = generateParentInviteCode();
    const exists = await prisma.parentInviteCode.findUnique({ where: { code: candidate } });
    if (!exists) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    throw new AppError("Không thể tạo mã liên kết. Vui lòng thử lại.", 500, "CODE_GEN_ERROR");
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  return prisma.parentInviteCode.create({
    data: {
      studentId,
      code,
      expiresAt,
    },
  });
}

export async function listStudentParentCodes(studentId: string) {
  return prisma.parentInviteCode.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

export async function redeemParentInviteCode(
  parentId: string,
  code: string,
  relation = "Phụ huynh"
) {
  const normalized = code.trim().toUpperCase();
  const invite = await prisma.parentInviteCode.findUnique({
    where: { code: normalized },
    include: { student: { select: { id: true, name: true, email: true } } },
  });

  if (!invite) {
    throw new AppError("Mã liên kết không tồn tại.", 404, "INVALID_CODE");
  }
  if (invite.usedAt) {
    throw new AppError("Mã liên kết này đã được sử dụng.", 409, "CODE_USED");
  }
  if (invite.expiresAt < new Date()) {
    throw new AppError("Mã liên kết đã hết hạn (quá 7 ngày).", 410, "CODE_EXPIRED");
  }

  const now = new Date();
  const link = await prisma.$transaction(async (tx) => {
    // Atomic claim: two parents redeeming the same code concurrently -> only one wins
    const claimed = await tx.parentInviteCode.updateMany({
      where: { id: invite.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count === 0) {
      throw new AppError("Mã liên kết này đã được sử dụng.", 409, "CODE_USED");
    }

    return tx.parentLink.upsert({
      where: { parentId_studentId: { parentId, studentId: invite.studentId } },
      create: {
        parentId,
        studentId: invite.studentId,
        relation,
        verifiedAt: now,
      },
      update: {
        relation,
        verifiedAt: now,
      },
      include: {
        student: { select: { id: true, name: true, email: true } },
      },
    });
  });

  return link;
}

export async function listParentChildren(parentId: string) {
  const links = await prisma.parentLink.findMany({
    where: { parentId, verifiedAt: { not: null } },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          enrollments: {
            where: { status: "ACTIVE", class: { deletedAt: null } },
            include: {
              class: {
                select: {
                  id: true,
                  name: true,
                  teacher: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return links.map((l) => ({
    linkId: l.id,
    relation: l.relation ?? "Phụ huynh",
    studentId: l.student.id,
    studentName: l.student.name,
    classes: l.student.enrollments.map((e) => ({
      id: e.class.id,
      name: e.class.name,
      teacherName: e.class.teacher.name,
    })),
  }));
}

/**
 * Computes full Parent Portal overview for ONE verified child.
 * SECURITY GUARANTEE: Never includes any other student's name, ID, or individual score!
 * Only returns aggregated class averages and rank position (X / Y).
 */
export async function getChildOverviewForParent(studentId: string, selectedClassId?: string) {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      enrollments: {
        where: { status: "ACTIVE", class: { deletedAt: null } },
        include: {
          class: {
            select: {
              id: true,
              name: true,
              teacher: { select: { name: true } },
              _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
            },
          },
        },
      },
    },
  });

  if (!student) {
    throw new AppError("Không tìm thấy học sinh.", 404, "NOT_FOUND");
  }

  const classes = student.enrollments.map((e) => e.class);
  const classIds = selectedClassId
    ? classes.filter((c) => c.id === selectedClassId).map((c) => c.id)
    : classes.map((c) => c.id);

  if (classIds.length === 0) {
    return {
      student: { id: student.id, name: student.name },
      classes: [],
      kpis: {
        childAvg10: 0,
        classAvg10: 0,
        rank: null as number | null,
        totalStudents: 0,
        onTimeRate: 0,
        onTimeCount: 0,
        totalSubmitted: 0,
        pendingCount: 0,
      },
      trend: [],
      classPerformance: [],
      skills: DISPLAY_SKILLS.map((skill) => ({
        skill,
        childPct: null as number | null,
        classPct: null as number | null,
      })),
      recentAssignments: [],
      offlineGrades: [],
      teacherFeedback: [],
      proctorAlerts: [],
    };
  }

  // Load assignments in child's classes (respecting AssignmentTarget subsets)
  const assignments = await prisma.assignment.findMany({
    where: {
      classId: { in: classIds },
      OR: [{ targets: { none: {} } }, { targets: { some: { studentId } } }],
    },
    orderBy: { createdAt: "asc" },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          teacher: { select: { name: true } },
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
        where: { status: { in: ["SUBMITTED", "GRADED"] }, flagged: false },
        select: {
          id: true,
          studentId: true,
          status: true,
          startedAt: true,
          submittedAt: true,
          isLate: true,
          totalScore: true,
          autoScore: true,
          maxScore: true,
          teacherComment: true,
          violationCount: true,
          lockedAt: true,
          answers: {
            select: {
              score: true,
              teacherNote: true,
              field: { select: { points: true, skillTag: true, label: true } },
            },
          },
          proctorEvents: {
            select: { type: true, at: true, durationMs: true },
            orderBy: { at: "desc" },
            take: 10,
          },
        },
      },
    },
  });

  // Aggregate metrics per assignment WITHOUT exposing other students' identities
  let childScoreSum10 = 0;
  let childGradedCount = 0;
  let classAvgSum10 = 0;
  let classAvgCount = 0;
  let onTimeCount = 0;
  let totalSubmitted = 0;
  let pendingCount = 0;

  // For skill comparison
  const childSkillEarned: Record<string, number> = {};
  const childSkillMax: Record<string, number> = {};
  const classSkillEarned: Record<string, number> = {};
  const classSkillMax: Record<string, number> = {};

  const trend: Array<{
    assignmentId: string;
    label: string;
    childScore10: number | null;
    classAvg10: number | null;
  }> = [];

  const recentAssignments: Array<{
    assignmentId: string;
    title: string;
    className: string;
    questionCount: number;
    dueAt: string | null;
    status: "NOT_STARTED" | "ON_TIME" | "LATE";
    childScore: number | null;
    maxScore: number | null;
    childScore10: number | null;
    classAvg10: number | null;
    rank: number | null;
    totalParticipants: number;
  }> = [];

  const teacherFeedback: Array<{
    assignmentTitle: string;
    className: string;
    teacherName: string;
    submittedAt: string | null;
    comment: string;
  }> = [];

  const proctorAlerts: Array<{
    assignmentTitle: string;
    violationCount: number;
    events: Array<{ type: string; at: string; durationMs: number | null }>;
  }> = [];

  // For per-class / per-subject comparison (multi-subject friendly, strictly aggregated)
  const classBuckets = new Map<
    string,
    {
      classId: string;
      className: string;
      teacherName: string;
      studentCount: number;
      totalAssignments: number;
      submittedCount: number;
      onTimeCount: number;
      childSum10: number;
      childGraded: number;
      classSum10: number;
      classGraded: number;
    }
  >();
  for (const cls of classes) {
    if (!classIds.includes(cls.id)) continue;
    classBuckets.set(cls.id, {
      classId: cls.id,
      className: cls.name,
      teacherName: cls.teacher.name,
      studentCount: cls._count.enrollments,
      totalAssignments: 0,
      submittedCount: 0,
      onTimeCount: 0,
      childSum10: 0,
      childGraded: 0,
      classSum10: 0,
      classGraded: 0,
    });
  }

  // For overall class rank across aggregated student scores (anonymous map)
  const overallStudentTotals = new Map<string, { sum10: number; count: number }>();

  for (const asg of assignments) {
    // Best submission per student for this assignment
    // Scores only count once fully graded (no pending essay) and once the teacher's
    // showResult setting allows the student to see them.
    const scoreableSubs = asg.submissions.filter(
      (s) => s.status === "GRADED" && canRevealResult(asg, s.status)
    );
    const bestByStudent = new Map<string, (typeof asg.submissions)[number]>();
    for (const sub of scoreableSubs) {
      const prev = bestByStudent.get(sub.studentId);
      const curScore = sub.totalScore ?? sub.autoScore ?? 0;
      const prevScore = prev ? (prev.totalScore ?? prev.autoScore ?? 0) : -1;
      if (!prev || curScore > prevScore) {
        bestByStudent.set(sub.studentId, sub);
      }
    }

    const bestList = Array.from(bestByStudent.values());
    const scale10List = bestList
      .filter((s) => s.maxScore > 0)
      .map((s) => {
        const sc = s.totalScore ?? s.autoScore ?? 0;
        const s10 = Math.round((sc / s.maxScore) * 1000) / 100;
        const dur =
          s.submittedAt && s.startedAt
            ? Math.max(0, s.submittedAt.getTime() - s.startedAt.getTime())
            : 0;
        return { studentId: s.studentId, score10: s10, durationMs: dur };
      });

    for (const item of scale10List) {
      const cur = overallStudentTotals.get(item.studentId) ?? { sum10: 0, count: 0 };
      cur.sum10 += item.score10;
      cur.count += 1;
      overallStudentTotals.set(item.studentId, cur);
    }

    // Skill aggregation for class & child
    for (const sub of bestList) {
      const isChild = sub.studentId === studentId;
      for (const ans of sub.answers) {
        const tag = ans.field.skillTag;
        if (!tag) continue;
        if (ans.score === null) continue; // ungraded essay: not a 0
        const earned = ans.score;
        const max = ans.field.points;
        classSkillEarned[tag] = (classSkillEarned[tag] ?? 0) + earned;
        classSkillMax[tag] = (classSkillMax[tag] ?? 0) + max;
        if (isChild) {
          childSkillEarned[tag] = (childSkillEarned[tag] ?? 0) + earned;
          childSkillMax[tag] = (childSkillMax[tag] ?? 0) + max;
        }
      }
    }

    const classAvg10 =
      scale10List.length > 0
        ? Math.round(
            (scale10List.reduce((sum, x) => sum + x.score10, 0) / scale10List.length) * 100
          ) / 100
        : null;

    const classBucket = classBuckets.get(asg.classId);
    if (classBucket) {
      classBucket.totalAssignments += 1;
    }

    if (classAvg10 !== null) {
      classAvgSum10 += classAvg10;
      classAvgCount += 1;
      if (classBucket) {
        classBucket.classSum10 += classAvg10;
        classBucket.classGraded += 1;
      }
    }

    const childSub = bestByStudent.get(studentId);
    const childAnySub = asg.submissions
      .filter((s) => s.studentId === studentId)
      .sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0))[0];
    if (childAnySub) {
      totalSubmitted++;
      if (!childAnySub.isLate) onTimeCount++;
      if (classBucket) {
        classBucket.submittedCount += 1;
        if (!childAnySub.isLate) classBucket.onTimeCount += 1;
      }
    }
    let childScore10: number | null = null;
    let rank: number | null = null;

    if (childSub) {
      const sc = childSub.totalScore ?? childSub.autoScore ?? 0;
      if (childSub.maxScore > 0) {
        childScore10 = Math.round((sc / childSub.maxScore) * 1000) / 100;
        childScoreSum10 += childScore10;
        childGradedCount++;
        if (classBucket) {
          classBucket.childSum10 += childScore10;
          classBucket.childGraded += 1;
        }
      }

      // Rank child among class participants (tie-break by score10 DESC, durationMs ASC)
      const sorted = [...scale10List].sort(
        (a, b) => b.score10 - a.score10 || a.durationMs - b.durationMs
      );
      const idx = sorted.findIndex((x) => x.studentId === studentId);
      if (idx >= 0) {
        rank = idx + 1;
      }

      if (childSub.teacherComment && childSub.teacherComment.trim().length > 0) {
        teacherFeedback.push({
          assignmentTitle: asg.title,
          className: asg.class.name,
          teacherName: asg.class.teacher.name,
          submittedAt: childSub.submittedAt?.toISOString() ?? null,
          comment: childSub.teacherComment,
        });
      }
    }
    if (childAnySub) {
      if (asg.shareProctorWithParent && childAnySub.violationCount > 0) {
        proctorAlerts.push({
          assignmentTitle: asg.title,
          violationCount: childAnySub.violationCount,
          events: childAnySub.proctorEvents.map((e) => ({
            type: e.type,
            at: e.at.toISOString(),
            durationMs: e.durationMs,
          })),
        });
      }
    } else {
      pendingCount++;
    }

    trend.push({
      assignmentId: asg.id,
      label: asg.title.length > 18 ? `${asg.title.slice(0, 18)}…` : asg.title,
      childScore10,
      classAvg10,
    });

    recentAssignments.push({
      assignmentId: asg.id,
      title: asg.title,
      className: asg.class.name,
      questionCount: asg.worksheet._count.fields,
      dueAt: asg.dueAt?.toISOString() ?? null,
      status: !childAnySub ? "NOT_STARTED" : childAnySub.isLate ? "LATE" : "ON_TIME",
      childScore: childSub ? Math.round((childSub.totalScore ?? childSub.autoScore ?? 0) * 100) / 100 : null,
      maxScore: childSub ? childSub.maxScore : childAnySub ? childAnySub.maxScore : null,
      childScore10,
      classAvg10,
      rank,
      totalParticipants: Math.max(asg.class._count.enrollments, scale10List.length),
    });
  }

  // Compute child's overall rank in class (anonymously, returning ONLY rank number & total count!)
  const overallRankList = Array.from(overallStudentTotals.entries())
    .map(([sid, val]) => ({
      sid,
      avg: val.count > 0 ? val.sum10 / val.count : 0,
    }))
    .sort((a, b) => b.avg - a.avg);

  let childOverallRank: number | null = (() => {
    const idx = overallRankList.findIndex((r) => r.sid === studentId);
    return idx >= 0 ? idx + 1 : null;
  })();
  let primaryClassStudents = classes[0]?._count.enrollments ?? overallRankList.length;
  // With a single class, use exactly the same ranking as the class leaderboard so the
  // parent portal and the leaderboard never disagree.
  if (classIds.length === 1) {
    const lb = await getClassSemesterLeaderboard({
      classId: classIds[0]!,
      viewerId: studentId,
      isTeacher: true,
    });
    childOverallRank = lb.currentUserEntry?.rank ?? null;
    primaryClassStudents = lb.totalStudentsInClass;
  }

  const classPerformance = Array.from(classBuckets.values()).map((b) => ({
    classId: b.classId,
    className: b.className,
    teacherName: b.teacherName,
    studentCount: b.studentCount,
    totalAssignments: b.totalAssignments,
    submittedCount: b.submittedCount,
    onTimeCount: b.onTimeCount,
    childAvg10: b.childGraded > 0 ? Math.round((b.childSum10 / b.childGraded) * 100) / 100 : null,
    classAvg10: b.classGraded > 0 ? Math.round((b.classSum10 / b.classGraded) * 100) / 100 : null,
  }));

  const skills = DISPLAY_SKILLS.map((skill) => {
    const cMax = childSkillMax[skill] ?? 0;
    const clMax = classSkillMax[skill] ?? 0;
    return {
      skill,
      // null = no graded data yet for this skill (shown as "—", not as 0%)
      childPct: cMax > 0 ? Math.round(((childSkillEarned[skill] ?? 0) / cMax) * 100) : null,
      classPct: clMax > 0 ? Math.round(((classSkillEarned[skill] ?? 0) / clMax) * 100) : null,
    };
  });

  // Load offline paper test grades strictly scoped to childId (only anonymous classAvg10)
  const offlineColumns = await prisma.offlineGradeColumn.findMany({
    where: { classId: { in: classIds } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      class: { select: { id: true, name: true } },
      entries: {
        where: { score: { not: null } },
        select: { studentId: true, score: true, note: true },
      },
    },
  });

  const offlineGrades = offlineColumns.map((col) => {
    const childEntry = col.entries.find((e) => e.studentId === studentId);
    const scale10Values = col.entries
      .map((e) => (e.score !== null ? normalizeToScale10(e.score, col.maxScore) : null))
      .filter((v): v is number => v !== null);
    const classAvg10 =
      scale10Values.length > 0
        ? round2(scale10Values.reduce((s, v) => s + v, 0) / scale10Values.length)
        : null;

    return {
      columnId: col.id,
      classId: col.class.id,
      className: col.class.name,
      title: col.title,
      date: col.date.toISOString(),
      score: childEntry?.score ?? null,
      maxScore: col.maxScore,
      score10:
        childEntry?.score !== null && childEntry?.score !== undefined
          ? normalizeToScale10(childEntry.score, col.maxScore)
          : null,
      weight: col.weight,
      note: childEntry?.note ?? col.note ?? null,
      classAvg10,
    };
  });

  return {
    student: { id: student.id, name: student.name },
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      teacherName: c.teacher.name,
      studentCount: c._count.enrollments,
    })),
    kpis: {
      childAvg10:
        childGradedCount > 0 ? Math.round((childScoreSum10 / childGradedCount) * 100) / 100 : 0,
      classAvg10:
        classAvgCount > 0 ? Math.round((classAvgSum10 / classAvgCount) * 100) / 100 : 0,
      rank: childOverallRank,
      totalStudents: Math.max(primaryClassStudents, overallRankList.length),
      onTimeRate: totalSubmitted > 0 ? Math.round((onTimeCount / totalSubmitted) * 100) : 0,
      onTimeCount,
      totalSubmitted,
      pendingCount,
    },
    trend: trend.slice(-10),
    classPerformance,
    skills,
    recentAssignments: recentAssignments.reverse(),
    offlineGrades,
    teacherFeedback: teacherFeedback.reverse(),
    proctorAlerts,
  };
}
