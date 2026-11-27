import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const DEFAULT_BEHAVIOR_PRESETS: Array<{ label: string; delta: number; icon: string }> = [
  { label: "Phát biểu hay", delta: 2, icon: "💬" },
  { label: "Làm bài tốt", delta: 2, icon: "⭐" },
  { label: "Hỗ trợ bạn", delta: 1, icon: "🤝" },
  { label: "Mất trật tự", delta: -1, icon: "🔇" },
];

export const BEHAVIOR_DELTA_LIMIT = 10;

function toPresetDTO(p: {
  id: string;
  classId: string;
  label: string;
  delta: number;
  icon: string | null;
  createdAt: Date;
}) {
  return { ...p, createdAt: p.createdAt.toISOString() };
}

/** Lists presets of a class, seeding the 4 default presets the first time a class has none. */
export async function listBehaviorPresets(classId: string) {
  const existing = await prisma.classBehaviorPreset.findMany({
    where: { classId },
    orderBy: [{ delta: "desc" }, { createdAt: "asc" }],
  });
  if (existing.length > 0) return existing.map(toPresetDTO);

  await prisma.classBehaviorPreset.createMany({
    data: DEFAULT_BEHAVIOR_PRESETS.map((p) => ({ classId, ...p })),
  });
  const seeded = await prisma.classBehaviorPreset.findMany({
    where: { classId },
    orderBy: [{ delta: "desc" }, { createdAt: "asc" }],
  });
  return seeded.map(toPresetDTO);
}

export async function createBehaviorPreset(
  classId: string,
  input: { label: string; delta: number; icon?: string | null }
) {
  const count = await prisma.classBehaviorPreset.count({ where: { classId } });
  if (count >= 30) {
    throw new AppError("Mỗi lớp tối đa 30 mẫu điểm cộng.", 400, "BEHAVIOR_PRESET_LIMIT");
  }
  const preset = await prisma.classBehaviorPreset.create({
    data: { classId, label: input.label.trim(), delta: input.delta, icon: input.icon ?? null },
  });
  return toPresetDTO(preset);
}

export async function deleteBehaviorPreset(classId: string, presetId: string) {
  const res = await prisma.classBehaviorPreset.deleteMany({ where: { id: presetId, classId } });
  if (res.count === 0) {
    throw new AppError("Không tìm thấy mẫu điểm cộng.", 404, "NOT_FOUND");
  }
  return { ok: true };
}

/**
 * Awards (or deducts) points for one or many students. Only ACTIVE, non-trashed students of the class
 * are accepted; a preset / class session must belong to the same class (IDOR guard).
 */
export async function awardBehaviorPoints(
  classId: string,
  actorId: string,
  input: {
    studentIds: string[];
    delta?: number;
    reason?: string;
    sessionId?: string | null;
    presetId?: string | null;
  }
) {
  let delta = input.delta;
  let reason = input.reason?.trim() ?? "";

  if (input.presetId) {
    const preset = await prisma.classBehaviorPreset.findFirst({
      where: { id: input.presetId, classId },
    });
    if (!preset) {
      throw new AppError("Không tìm thấy mẫu điểm cộng.", 404, "NOT_FOUND");
    }
    delta ??= preset.delta;
    if (!reason) reason = preset.label;
  }

  if (delta === undefined || !Number.isInteger(delta) || delta === 0) {
    throw new AppError("Số điểm cộng/trừ không hợp lệ.", 400, "VALIDATION_ERROR");
  }
  if (Math.abs(delta) > BEHAVIOR_DELTA_LIMIT) {
    throw new AppError("Số điểm cộng/trừ không hợp lệ.", 400, "VALIDATION_ERROR");
  }
  if (!reason) {
    throw new AppError("Vui lòng nhập lý do.", 400, "VALIDATION_ERROR");
  }

  if (input.sessionId) {
    const session = await prisma.classSession.findFirst({
      where: { id: input.sessionId, classId },
      select: { id: true },
    });
    if (!session) {
      throw new AppError("Không tìm thấy buổi học.", 404, "NOT_FOUND");
    }
  }

  const uniqueIds = Array.from(new Set(input.studentIds));
  const active = await prisma.enrollment.findMany({
    where: {
      classId,
      status: "ACTIVE",
      studentId: { in: uniqueIds },
      student: { deletedAt: null },
    },
    select: { studentId: true },
  });
  const activeIds = active.map((e) => e.studentId);
  if (activeIds.length === 0) {
    throw new AppError("Không có học sinh hợp lệ trong lớp.", 400, "NO_VALID_STUDENTS");
  }

  await prisma.studentBehaviorPoint.createMany({
    data: activeIds.map((studentId) => ({
      classId,
      studentId,
      delta,
      reason: reason.slice(0, 200),
      sessionId: input.sessionId ?? null,
      presetId: input.presetId ?? null,
      awardedById: actorId,
    })),
  });

  return { awardedCount: activeIds.length, skippedCount: uniqueIds.length - activeIds.length };
}

export async function deleteBehaviorPoint(classId: string, pointId: string) {
  const res = await prisma.studentBehaviorPoint.deleteMany({ where: { id: pointId, classId } });
  if (res.count === 0) {
    throw new AppError("Không tìm thấy lượt điểm cộng.", 404, "NOT_FOUND");
  }
  return { ok: true };
}

function parseRangeDate(value?: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) d.setHours(23, 59, 59, 999);
  return d;
}

/** Per-student totals (all ACTIVE students, including those with 0) plus the latest history rows. */
export async function getClassBehaviorSummary(
  classId: string,
  range: { from?: string | null; to?: string | null; sessionId?: string | null } = {}
) {
  const from = parseRangeDate(range.from);
  const to = parseRangeDate(range.to, true);
  const createdAt = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;

  const [enrollments, totals, recent] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classId, status: "ACTIVE", student: { deletedAt: null } },
      orderBy: { student: { name: "asc" } },
      select: { student: { select: { id: true, name: true, avatarUrl: true } } },
    }),
    prisma.studentBehaviorPoint.groupBy({
      by: ["studentId"],
      where: { classId, createdAt, ...(range.sessionId ? { sessionId: range.sessionId } : {}) },
      _sum: { delta: true },
      _count: { _all: true },
    }),
    prisma.studentBehaviorPoint.findMany({
      where: { classId, createdAt, ...(range.sessionId ? { sessionId: range.sessionId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        studentId: true,
        delta: true,
        reason: true,
        sessionId: true,
        createdAt: true,
        student: { select: { name: true } },
        awardedBy: { select: { name: true } },
      },
    }),
  ]);

  const totalMap = new Map(totals.map((t) => [t.studentId, t._sum.delta ?? 0]));
  const students = enrollments.map((e) => ({
    student: e.student,
    total: totalMap.get(e.student.id) ?? 0,
  }));

  return {
    students,
    recent: recent.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      studentName: r.student.name,
      delta: r.delta,
      reason: r.reason,
      sessionId: r.sessionId,
      awardedByName: r.awardedBy.name,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/** Sum of behavior points per student for a class (used by the gradebook). */
export async function getBehaviorTotalsByStudent(classId: string): Promise<Map<string, number>> {
  const totals = await prisma.studentBehaviorPoint.groupBy({
    by: ["studentId"],
    where: { classId },
    _sum: { delta: true },
  });
  return new Map(totals.map((t) => [t.studentId, t._sum.delta ?? 0]));
}

/** Behavior history of one child across their active classes (used by the parent portal). */
export async function getStudentBehaviorForParent(studentId: string, classIds: string[]) {
  if (classIds.length === 0) return { total: 0, recent: [] };
  const where = { studentId, classId: { in: classIds } };
  const [sum, recent] = await Promise.all([
    prisma.studentBehaviorPoint.aggregate({ where, _sum: { delta: true } }),
    prisma.studentBehaviorPoint.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        delta: true,
        reason: true,
        createdAt: true,
        class: { select: { name: true } },
      },
    }),
  ]);
  return {
    total: sum._sum.delta ?? 0,
    recent: recent.map((r) => ({
      id: r.id,
      delta: r.delta,
      reason: r.reason,
      className: r.class.name,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
