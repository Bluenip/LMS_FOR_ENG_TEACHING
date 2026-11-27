import type { AttendanceStatus, Prisma, SessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { expandScheduleOccurrences, parseTimeToMinutes } from "@/lib/schedule/recurrence";
import { computeAttendanceSummary } from "@/lib/attendance-calc";
import { logAudit } from "@/server/auditService";

export interface CreateScheduleRuleInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  title?: string | null;
  meetingUrl?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  generateWeeks?: number;
}

export interface CreateMakeupSessionInput {
  title: string;
  startsAt: string;
  endsAt: string;
  isMakeup?: boolean;
  meetingUrl?: string | null;
  notes?: string | null;
  lessonIds?: string[];
  assignmentIds?: string[];
}

export interface UpdateClassSessionInput {
  title?: string;
  startsAt?: string;
  endsAt?: string;
  status?: SessionStatus;
  meetingUrl?: string | null;
  notes?: string | null;
  lessonIds?: string[];
  assignmentIds?: string[];
}

function parseJsonStringArray(val: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((x): x is string => typeof x === "string" && x.length > 0);
}

async function assertClassAttachmentsBelongToClass(
  classId: string,
  lessonIds?: string[],
  assignmentIds?: string[]
) {
  const uniqueLessons = Array.from(new Set(lessonIds ?? []));
  if (uniqueLessons.length > 0) {
    const foundLessons = await prisma.lesson.findMany({
      where: {
        id: { in: uniqueLessons },
        deletedAt: null,
        OR: [{ classId }, { classLinks: { some: { classId } } }],
      },
      select: { id: true },
    });
    if (foundLessons.length !== uniqueLessons.length) {
      throw new AppError(
        "Bài giảng hoặc bài tập đính kèm không thuộc lớp này.",
        400,
        "VALIDATION_ERROR"
      );
    }
  }

  const uniqueAssignments = Array.from(new Set(assignmentIds ?? []));
  if (uniqueAssignments.length > 0) {
    const foundAssignments = await prisma.assignment.findMany({
      where: {
        id: { in: uniqueAssignments },
        classId,
      },
      select: { id: true },
    });
    if (foundAssignments.length !== uniqueAssignments.length) {
      throw new AppError(
        "Bài giảng hoặc bài tập đính kèm không thuộc lớp này.",
        400,
        "VALIDATION_ERROR"
      );
    }
  }

  return { uniqueLessons, uniqueAssignments };
}

export async function listClassScheduleRules(classId: string) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, deletedAt: true },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }

  const rules = await prisma.classScheduleRule.findMany({
    where: { classId, active: true },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    include: {
      _count: { select: { sessions: true } },
    },
  });

  return rules.map((r) => ({
    id: r.id,
    classId: r.classId,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
    title: r.title,
    meetingUrl: r.meetingUrl,
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo?.toISOString() ?? null,
    active: r.active,
    sessionCount: r._count.sessions,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createScheduleRuleAndGenerateSessions(
  classId: string,
  input: CreateScheduleRuleInput,
  actorId?: string
) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }

  const startMin = parseTimeToMinutes(input.startTime);
  const endMin = parseTimeToMinutes(input.endTime);
  if (startMin === null || endMin === null || endMin <= startMin) {
    throw new AppError("Giờ kết thúc phải sau giờ bắt đầu.", 400, "VALIDATION_ERROR");
  }

  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
  const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new AppError("Ngày kết thúc phải sau ngày bắt đầu.", 400, "VALIDATION_ERROR");
  }

  const weeks = Math.max(1, Math.min(26, input.generateWeeks ?? 12));
  const rangeEnd = effectiveTo ?? new Date(effectiveFrom.getTime() + weeks * 7 * 86_400_000);

  const rule = await prisma.classScheduleRule.create({
    data: {
      classId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      title: input.title ?? null,
      meetingUrl: input.meetingUrl ?? null,
      effectiveFrom,
      effectiveTo,
      active: true,
    },
  });

  const occurrences = expandScheduleOccurrences(
    {
      dayOfWeek: rule.dayOfWeek,
      startTime: rule.startTime,
      endTime: rule.endTime,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      active: true,
    },
    effectiveFrom,
    rangeEnd
  );

  const defaultTitle = input.title?.trim() || `${cls.name} (${input.startTime}–${input.endTime})`;
  let generatedCount = 0;
  if (occurrences.length > 0) {
    const res = await prisma.classSession.createMany({
      data: occurrences.map((occ) => ({
        classId,
        ruleId: rule.id,
        title: defaultTitle,
        startsAt: occ.startsAt,
        endsAt: occ.endsAt,
        status: "SCHEDULED",
        isMakeup: false,
        meetingUrl: rule.meetingUrl,
      })),
      skipDuplicates: true,
    });
    generatedCount = res.count;
  }

  await logAudit({
    actorId: actorId ?? null,
    action: "SCHEDULE_RULE_CREATED",
    targetType: "CLASS",
    targetId: classId,
    summary: `Tạo lịch học lặp cho lớp ${cls.name} (${generatedCount} buổi)`,
    meta: { ruleId: rule.id, dayOfWeek: rule.dayOfWeek, generatedCount },
  });

  return {
    rule: {
      id: rule.id,
      classId: rule.classId,
      dayOfWeek: rule.dayOfWeek,
      startTime: rule.startTime,
      endTime: rule.endTime,
      title: rule.title,
      meetingUrl: rule.meetingUrl,
      effectiveFrom: rule.effectiveFrom.toISOString(),
      effectiveTo: rule.effectiveTo?.toISOString() ?? null,
      active: rule.active,
    },
    generatedCount,
  };
}

export async function deleteScheduleRule(classId: string, ruleId: string, actorId?: string) {
  const rule = await prisma.classScheduleRule.findUnique({
    where: { id: ruleId },
    select: { id: true, classId: true, dayOfWeek: true, startTime: true },
  });
  if (!rule || rule.classId !== classId) {
    throw new AppError("Không tìm thấy quy tắc lịch học.", 404, "NOT_FOUND");
  }

  const now = new Date();
  await prisma.$transaction([
    // Remove only future unmarked scheduled sessions belonging to this rule; preserve history!
    prisma.classSession.deleteMany({
      where: {
        ruleId,
        status: "SCHEDULED",
        startsAt: { gt: now },
        attendanceRecords: { none: {} },
      },
    }),
    prisma.classScheduleRule.delete({ where: { id: ruleId } }),
  ]);

  await logAudit({
    actorId: actorId ?? null,
    action: "SCHEDULE_RULE_DELETED",
    targetType: "CLASS",
    targetId: classId,
    summary: `Xoá quy tắc lịch học (${rule.startTime})`,
    meta: { ruleId },
  });

  return { ok: true };
}

export async function listClassSessions(
  classId: string,
  opts?: { from?: Date; to?: Date; viewerStudentId?: string }
) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }

  const where: Prisma.ClassSessionWhereInput = { classId };
  if (opts?.from || opts?.to) {
    where.startsAt = {
      ...(opts.from ? { gte: opts.from } : {}),
      ...(opts.to ? { lte: opts.to } : {}),
    };
  }

  const sessions = await prisma.classSession.findMany({
    where,
    orderBy: { startsAt: "asc" },
    include: {
      attendanceRecords: opts?.viewerStudentId
        ? {
            where: { studentId: opts.viewerStudentId },
            select: { studentId: true, status: true, note: true },
          }
        : {
            select: { studentId: true, status: true },
          },
    },
  });

  return sessions.map((s) => {
    const lessonIds = parseJsonStringArray(s.lessonIds);
    const assignmentIds = parseJsonStringArray(s.assignmentIds);

    if (opts?.viewerStudentId) {
      const myRec = s.attendanceRecords[0] as
        | { studentId: string; status: AttendanceStatus; note?: string | null }
        | undefined;
      return {
        id: s.id,
        classId: s.classId,
        className: cls.name,
        ruleId: s.ruleId,
        title: s.title,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        status: s.status,
        isMakeup: s.isMakeup,
        meetingUrl: s.meetingUrl,
        notes: s.notes,
        lessonIds,
        assignmentIds,
        myAttendance: myRec
          ? { status: myRec.status, note: myRec.note ?? null }
          : null,
      };
    }

    const summary = computeAttendanceSummary(s.attendanceRecords.map((r) => r.status));
    return {
      id: s.id,
      classId: s.classId,
      className: cls.name,
      ruleId: s.ruleId,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      status: s.status,
      isMakeup: s.isMakeup,
      meetingUrl: s.meetingUrl,
      notes: s.notes,
      lessonIds,
      assignmentIds,
      attendanceSummary: summary,
    };
  });
}

export async function createMakeupSession(
  classId: string,
  input: CreateMakeupSessionInput,
  actorId?: string
) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (endsAt <= startsAt) {
    throw new AppError("Thời gian kết thúc phải sau thời gian bắt đầu.", 400, "VALIDATION_ERROR");
  }

  const { uniqueLessons, uniqueAssignments } = await assertClassAttachmentsBelongToClass(
    classId,
    input.lessonIds,
    input.assignmentIds
  );

  const session = await prisma.classSession.create({
    data: {
      classId,
      title: input.title,
      startsAt,
      endsAt,
      isMakeup: input.isMakeup ?? true,
      meetingUrl: input.meetingUrl ?? null,
      notes: input.notes ?? null,
      lessonIds: uniqueLessons.length > 0 ? uniqueLessons : undefined,
      assignmentIds: uniqueAssignments.length > 0 ? uniqueAssignments : undefined,
    },
  });

  await logAudit({
    actorId: actorId ?? null,
    action: "CLASS_SESSION_CREATED",
    targetType: "CLASS",
    targetId: classId,
    summary: `Tạo buổi học mới "${session.title}" cho lớp ${cls.name}`,
    meta: { sessionId: session.id, isMakeup: session.isMakeup },
  });

  return {
    id: session.id,
    classId: session.classId,
    title: session.title,
    startsAt: session.startsAt.toISOString(),
    endsAt: session.endsAt.toISOString(),
    status: session.status,
    isMakeup: session.isMakeup,
    meetingUrl: session.meetingUrl,
    notes: session.notes,
    lessonIds: uniqueLessons,
    assignmentIds: uniqueAssignments,
  };
}

export async function getClassSessionDetail(
  sessionId: string,
  opts: { isTeacher: boolean; viewerStudentId?: string }
) {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      class: { select: { id: true, name: true, deletedAt: true } },
      attendanceRecords: opts.isTeacher
        ? { select: { studentId: true, status: true } }
        : {
            where: { studentId: opts.viewerStudentId ?? "" },
            select: { status: true, note: true },
          },
    },
  });

  if (!session || session.class.deletedAt) {
    throw new AppError("Không tìm thấy buổi học.", 404, "NOT_FOUND");
  }

  const lessonIds = parseJsonStringArray(session.lessonIds);
  const assignmentIds = parseJsonStringArray(session.assignmentIds);

  const [lessons, assignments] = await Promise.all([
    lessonIds.length > 0
      ? prisma.lesson.findMany({
          where: { id: { in: lessonIds }, deletedAt: null },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    assignmentIds.length > 0
      ? prisma.assignment.findMany({
          where: { id: { in: assignmentIds }, classId: session.classId },
          select: { id: true, title: true, dueAt: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    id: session.id,
    classId: session.classId,
    className: session.class.name,
    ruleId: session.ruleId,
    title: session.title,
    startsAt: session.startsAt.toISOString(),
    endsAt: session.endsAt.toISOString(),
    status: session.status,
    isMakeup: session.isMakeup,
    meetingUrl: session.meetingUrl,
    notes: session.notes,
    lessonIds,
    assignmentIds,
    lessons,
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      dueAt: a.dueAt?.toISOString() ?? null,
    })),
    ...(opts.isTeacher
      ? { attendanceSummary: computeAttendanceSummary(session.attendanceRecords.map((r) => r.status)) }
      : {
          myAttendance: session.attendanceRecords[0]
            ? {
                status: session.attendanceRecords[0].status,
                note: (session.attendanceRecords[0] as { note?: string | null }).note ?? null,
              }
            : null,
        }),
  };
}

export async function updateClassSession(
  sessionId: string,
  input: UpdateClassSessionInput,
  actorId?: string
) {
  const existing = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      classId: true,
      startsAt: true,
      endsAt: true,
      title: true,
    },
  });
  if (!existing) {
    throw new AppError("Không tìm thấy buổi học.", 404, "NOT_FOUND");
  }

  const nextStart = input.startsAt ? new Date(input.startsAt) : existing.startsAt;
  const nextEnd = input.endsAt ? new Date(input.endsAt) : existing.endsAt;
  if (nextEnd <= nextStart) {
    throw new AppError("Thời gian kết thúc phải sau thời gian bắt đầu.", 400, "VALIDATION_ERROR");
  }

  let validatedLessons: string[] | undefined;
  let validatedAssignments: string[] | undefined;
  if (input.lessonIds !== undefined || input.assignmentIds !== undefined) {
    const res = await assertClassAttachmentsBelongToClass(
      existing.classId,
      input.lessonIds,
      input.assignmentIds
    );
    if (input.lessonIds !== undefined) validatedLessons = res.uniqueLessons;
    if (input.assignmentIds !== undefined) validatedAssignments = res.uniqueAssignments;
  }

  const updated = await prisma.classSession.update({
    where: { id: sessionId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.startsAt !== undefined ? { startsAt: nextStart } : {}),
      ...(input.endsAt !== undefined ? { endsAt: nextEnd } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.meetingUrl !== undefined ? { meetingUrl: input.meetingUrl } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(validatedLessons !== undefined ? { lessonIds: validatedLessons } : {}),
      ...(validatedAssignments !== undefined ? { assignmentIds: validatedAssignments } : {}),
    },
  });

  await logAudit({
    actorId: actorId ?? null,
    action: "CLASS_SESSION_UPDATED",
    targetType: "CLASS",
    targetId: existing.classId,
    summary: `Cập nhật buổi học "${updated.title}"`,
    meta: { sessionId: updated.id, status: updated.status },
  });

  return updated;
}

export async function deleteClassSession(sessionId: string, actorId?: string) {
  const existing = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: { id: true, classId: true, title: true },
  });
  if (!existing) {
    throw new AppError("Không tìm thấy buổi học.", 404, "NOT_FOUND");
  }

  await prisma.classSession.delete({ where: { id: sessionId } });
  await logAudit({
    actorId: actorId ?? null,
    action: "CLASS_SESSION_DELETED",
    targetType: "CLASS",
    targetId: existing.classId,
    summary: `Xoá buổi học "${existing.title}"`,
    meta: { sessionId },
  });

  return { ok: true };
}

export async function listScheduleForTeacher(
  teacherId: string,
  isAdmin: boolean,
  range: { from: Date; to: Date },
  classId?: string
) {
  const classWhere: Prisma.ClassWhereInput = {
    deletedAt: null,
    archived: false,
    ...(classId ? { id: classId } : {}),
    ...(isAdmin
      ? {}
      : {
          OR: [
            { teacherId },
            { classTeachers: { some: { userId: teacherId } } },
          ],
        }),
  };

  const classes = await prisma.class.findMany({
    where: classWhere,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const allowedClassIds = classes.map((c) => c.id);
  if (allowedClassIds.length === 0) {
    return { classes: [], sessions: [] };
  }

  const sessions = await prisma.classSession.findMany({
    where: {
      classId: { in: allowedClassIds },
      startsAt: { gte: range.from, lte: range.to },
    },
    orderBy: { startsAt: "asc" },
    include: {
      class: { select: { id: true, name: true } },
      attendanceRecords: { select: { status: true } },
    },
  });

  return {
    classes,
    sessions: sessions.map((s) => ({
      id: s.id,
      classId: s.classId,
      className: s.class.name,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      status: s.status,
      isMakeup: s.isMakeup,
      meetingUrl: s.meetingUrl,
      notes: s.notes,
      lessonIds: parseJsonStringArray(s.lessonIds),
      assignmentIds: parseJsonStringArray(s.assignmentIds),
      attendanceSummary: computeAttendanceSummary(s.attendanceRecords.map((r) => r.status)),
    })),
  };
}

export async function listScheduleForStudent(
  studentId: string,
  range: { from: Date; to: Date },
  classId?: string
) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      status: "ACTIVE",
      ...(classId ? { classId } : {}),
      class: { deletedAt: null, archived: false },
    },
    select: { class: { select: { id: true, name: true } } },
    orderBy: { class: { name: "asc" } },
  });

  const classes = enrollments.map((e) => e.class);
  const allowedClassIds = classes.map((c) => c.id);
  if (allowedClassIds.length === 0) {
    return { classes: [], sessions: [] };
  }

  const sessions = await prisma.classSession.findMany({
    where: {
      classId: { in: allowedClassIds },
      startsAt: { gte: range.from, lte: range.to },
    },
    orderBy: { startsAt: "asc" },
    include: {
      class: { select: { id: true, name: true } },
      attendanceRecords: {
        where: { studentId },
        select: { status: true, note: true },
      },
    },
  });

  return {
    classes,
    sessions: sessions.map((s) => ({
      id: s.id,
      classId: s.classId,
      className: s.class.name,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      status: s.status,
      isMakeup: s.isMakeup,
      meetingUrl: s.meetingUrl,
      notes: s.notes,
      lessonIds: parseJsonStringArray(s.lessonIds),
      assignmentIds: parseJsonStringArray(s.assignmentIds),
      myAttendance: s.attendanceRecords[0]
        ? {
            status: s.attendanceRecords[0].status,
            note: s.attendanceRecords[0].note ?? null,
          }
        : null,
    })),
  };
}
