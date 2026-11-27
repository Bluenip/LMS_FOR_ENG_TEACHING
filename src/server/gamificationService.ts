import { prisma } from "@/lib/db";
import { advanceStreak, getVnDayKey } from "@/lib/streak";

export const BADGE_META: Record<
  string,
  { nameVi: string; nameEn: string; descVi: string; descEn: string }
> = {
  FIRST_SUBMIT: {
    nameVi: "Khởi đầu xuất sắc",
    nameEn: "First Submission",
    descVi: "Hoàn thành bài tập đầu tiên",
    descEn: "Completed your first assignment",
  },
  ON_TIME_5: {
    nameVi: "Đúng hẹn kỷ luật",
    nameEn: "5 On-Time Streak",
    descVi: "Nộp đúng hạn từ 5 bài trở lên",
    descEn: "Submitted at least 5 assignments on time",
  },
  PERFECT_10: {
    nameVi: "Điểm 10 tuyệt đối",
    nameEn: "Perfect Score",
    descVi: "Đạt điểm tối đa trong một bài tập",
    descEn: "Achieved a 100% score on an assignment",
  },
  STREAK_7: {
    nameVi: "Chiến binh 7 ngày",
    nameEn: "7-Day Warrior",
    descVi: "Duy trì chuỗi học tập 7 ngày liên tiếp",
    descEn: "Studied 7 days in a row",
  },
};

/**
 * Updates daily streak and unlocks eligible badges after a submission is finalized.
 */
export async function recordSubmissionGamification(
  userId: string,
  opts: { scoreRatio: number | null; submittedAt?: Date }
) {
  const dayKey = getVnDayKey(opts.submittedAt ?? new Date());

  const existing = await prisma.studentStreak.findUnique({ where: { userId } });
  const nextStreak = advanceStreak(
    existing
      ? {
          currentStreak: existing.currentStreak,
          longestStreak: existing.longestStreak,
          lastActivityDate: existing.lastActivityDate,
        }
      : null,
    dayKey
  );

  await prisma.studentStreak.upsert({
    where: { userId },
    create: {
      userId,
      currentStreak: nextStreak.currentStreak,
      longestStreak: nextStreak.longestStreak,
      lastActivityDate: nextStreak.lastActivityDate,
    },
    update: {
      currentStreak: nextStreak.currentStreak,
      longestStreak: nextStreak.longestStreak,
      lastActivityDate: nextStreak.lastActivityDate,
    },
  });

  const [completedCount, onTimeCount] = await Promise.all([
    prisma.submission.count({
      where: { studentId: userId, status: { in: ["SUBMITTED", "GRADED"] } },
    }),
    prisma.submission.count({
      where: { studentId: userId, status: { in: ["SUBMITTED", "GRADED"] }, isLate: false },
    }),
  ]);

  const toGrant: string[] = [];
  if (completedCount >= 1) toGrant.push("FIRST_SUBMIT");
  if (onTimeCount >= 5) toGrant.push("ON_TIME_5");
  if (opts.scoreRatio !== null && opts.scoreRatio >= 0.9999) toGrant.push("PERFECT_10");
  if (nextStreak.currentStreak >= 7) toGrant.push("STREAK_7");

  if (toGrant.length > 0) {
    await prisma.studentBadge.createMany({
      data: toGrant.map((code) => ({ userId, code })),
      skipDuplicates: true,
    });
  }

  return nextStreak;
}

export async function getStudentGamificationSummary(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, status: "ACTIVE", class: { deletedAt: null } },
    select: { class: { select: { enableGamification: true } } },
  });

  // Hidden only when the student has enrolled classes and EVERY class disabled gamification
  const enabled =
    enrollments.length === 0 || enrollments.some((e) => e.class.enableGamification);
  if (!enabled) {
    return { enabled: false, streak: null, badges: [] };
  }

  const [streak, badges] = await Promise.all([
    prisma.studentStreak.findUnique({ where: { userId: studentId } }),
    prisma.studentBadge.findMany({
      where: { userId: studentId },
      orderBy: { earnedAt: "asc" },
    }),
  ]);

  return {
    enabled: true,
    streak: {
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
      lastActivityDate: streak?.lastActivityDate ?? null,
    },
    badges: badges.map((b) => ({
      code: b.code,
      earnedAt: b.earnedAt.toISOString(),
      meta: BADGE_META[b.code] ?? null,
    })),
  };
}
