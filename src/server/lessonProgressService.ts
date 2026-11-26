import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

export async function markLessonItemViewed(lessonItemId: string, studentId: string) {
  const item = await prisma.lessonItem.findUnique({
    where: { id: lessonItemId },
    select: {
      id: true,
      deletedAt: true,
      lesson: {
        select: {
          deletedAt: true,
          classLinks: {
            where: { class: { deletedAt: null } },
            select: { classId: true },
          },
        },
      },
    },
  });

  if (!item || item.deletedAt || item.lesson.deletedAt) {
    throw new AppError("Không tìm thấy tài liệu.", 404, "NOT_FOUND");
  }

  const classIds = item.lesson.classLinks.map((c) => c.classId);
  if (classIds.length === 0) {
    throw new AppError("Bạn chưa tham gia lớp học này.", 403, "FORBIDDEN");
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      studentId,
      status: "ACTIVE",
      classId: { in: classIds },
    },
    select: { id: true },
  });

  if (!enrollment) {
    throw new AppError("Bạn chưa tham gia lớp học này.", 403, "FORBIDDEN");
  }

  return prisma.lessonItemProgress.upsert({
    where: { lessonItemId_studentId: { lessonItemId, studentId } },
    update: {
      viewCount: { increment: 1 },
      completedAt: new Date(),
    },
    create: {
      lessonItemId,
      studentId,
      viewCount: 1,
    },
  });
}

export async function getClassLessonProgress(classId: string, opts?: { studentId?: string }) {
  const activeStudents = await prisma.enrollment.findMany({
    where: { classId, status: "ACTIVE", student: { deletedAt: null } },
    select: { studentId: true },
  });
  const activeIds = activeStudents.map((s) => s.studentId);
  const activeIdSet = new Set(activeIds);

  const links = await prisma.classLesson.findMany({
    where: { classId, lesson: { deletedAt: null } },
    select: {
      lesson: {
        select: {
          items: { where: { deletedAt: null }, select: { id: true } },
        },
      },
    },
  });
  const itemIds = links.flatMap((l) => l.lesson.items.map((it) => it.id));

  const byItem: Record<string, { completedCount: number; completedByMe: boolean }> = {};
  for (const id of itemIds) {
    byItem[id] = { completedCount: 0, completedByMe: false };
  }

  if (itemIds.length > 0 && activeIds.length > 0) {
    const rows = await prisma.lessonItemProgress.findMany({
      where: {
        lessonItemId: { in: itemIds },
        studentId: { in: activeIds },
      },
      select: { lessonItemId: true, studentId: true },
    });

    for (const r of rows) {
      if (!activeIdSet.has(r.studentId)) continue;
      const entry = byItem[r.lessonItemId];
      if (!entry) continue;
      entry.completedCount += 1;
      if (opts?.studentId && r.studentId === opts.studentId) {
        entry.completedByMe = true;
      }
    }
  }

  return {
    activeStudentCount: activeIds.length,
    byItem,
  };
}
