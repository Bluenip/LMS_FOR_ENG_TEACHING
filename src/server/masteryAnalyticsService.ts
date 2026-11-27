import { SkillTag, type Prisma, type Role, type WorksheetSubject } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hasMinClassRole } from "@/lib/class-roles";
import { createAssignmentSchema } from "@/lib/validators";
import { isManualFieldType } from "@/lib/grading";
import { detectAtRiskStudents, type StudentRiskStats } from "@/lib/analytics/at-risk";
import { computeMasteryMatrix, masteryTagLabel, summarizeStudentMastery, type TaggedAnswer } from "@/lib/analytics/mastery";
import { createAssignmentsForClasses } from "./assignmentService";
import { resolveUserClassRole } from "./classRoleHelper";

interface Viewer {
  id: string;
  role: Role;
}

const FINISHED = ["SUBMITTED", "GRADED", "RETURNED"] as const;
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}

/** Tests / mutations that must see fresh numbers immediately. */
export function clearAnalyticsCache() {
  cache.clear();
}

function parseDate(v?: string | null, endOfDay = false): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(v)) d.setHours(23, 59, 59, 999);
  return d;
}

/** Graded answers of the latest finished attempt per (student, assignment), tagged by topic or skill. */
async function loadTaggedAnswers(
  classIds: string[],
  opts: { from?: string | null; to?: string | null; subject?: WorksheetSubject | null; studentId?: string } = {}
): Promise<TaggedAnswer[]> {
  const from = parseDate(opts.from);
  const to = parseDate(opts.to, true);
  const subs = await prisma.submission.findMany({
    where: {
      status: { in: [...FINISHED] },
      ...(opts.studentId ? { studentId: opts.studentId } : {}),
      ...(from || to ? { submittedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      assignment: { classId: { in: classIds }, ...(opts.subject ? { worksheet: { subject: opts.subject } } : {}) },
    },
    orderBy: [{ attemptNo: "desc" }],
    select: {
      studentId: true,
      assignmentId: true,
      answers: {
        where: { score: { not: null } },
        select: { score: true, field: { select: { points: true, topicTag: true, skillTag: true } } },
      },
    },
  });
  const seen = new Set<string>();
  const out: TaggedAnswer[] = [];
  for (const s of subs) {
    const key = `${s.studentId}:${s.assignmentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const a of s.answers) {
      const tag = a.field.topicTag?.trim() || a.field.skillTag;
      if (!tag || !(a.field.points > 0)) continue;
      out.push({ studentId: s.studentId, tag, earned: a.score ?? 0, max: a.field.points });
    }
  }
  return out;
}

async function activeStudents(classId: string) {
  const rows = await prisma.enrollment.findMany({
    where: { classId, status: "ACTIVE", student: { deletedAt: null } },
    orderBy: { student: { name: "asc" } },
    select: { student: { select: { id: true, name: true } } },
  });
  return rows.map((r) => r.student);
}

export async function getClassMasteryMatrix(
  classId: string,
  opts: { from?: string | null; to?: string | null; subject?: WorksheetSubject | null } = {}
) {
  return cached(`mastery:${classId}:${opts.from ?? ""}:${opts.to ?? ""}:${opts.subject ?? ""}`, async () => {
    const [students, answers] = await Promise.all([activeStudents(classId), loadTaggedAnswers([classId], opts)]);
    return computeMasteryMatrix(students, answers);
  });
}

/** Classes whose data the viewer may see for this student (IDOR guard). */
async function allowedClassIdsForStudent(studentId: string, viewer: Viewer): Promise<string[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, status: "ACTIVE", class: { deletedAt: null } },
    select: { classId: true, class: { select: { teacherId: true } } },
  });
  if (viewer.role === "STUDENT") {
    if (viewer.id !== studentId) throw new AppError("Bạn không có quyền xem thông tin học sinh này.", 403, "FORBIDDEN");
    return enrollments.map((e) => e.classId);
  }
  if (viewer.role === "PARENT") {
    const link = await prisma.parentLink.findUnique({
      where: { parentId_studentId: { parentId: viewer.id, studentId } },
      select: { verifiedAt: true },
    });
    if (!link?.verifiedAt) throw new AppError("Bạn không có quyền xem thông tin học sinh này.", 403, "FORBIDDEN");
    return enrollments.map((e) => e.classId);
  }
  if (viewer.role === "ADMIN") return enrollments.map((e) => e.classId);
  const allowed: string[] = [];
  for (const e of enrollments) {
    const role = await resolveUserClassRole(e.classId, viewer.id, viewer.role, e.class.teacherId);
    if (hasMinClassRole(role, "ASSISTANT")) allowed.push(e.classId);
  }
  if (allowed.length === 0) throw new AppError("Bạn không có quyền xem thông tin học sinh này.", 403, "FORBIDDEN");
  return allowed;
}

export async function getStudentMasteryProfile(studentId: string, viewer: Viewer) {
  const classIds = await allowedClassIdsForStudent(studentId, viewer);
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, name: true } });
  if (!student) throw new AppError("Không tìm thấy học sinh.", 404, "NOT_FOUND");
  if (classIds.length === 0) {
    return { student, topics: [], strengths: [], toReview: [], developing: [] };
  }
  const answers = await loadTaggedAnswers(classIds, { studentId });
  const m = computeMasteryMatrix([student], answers);
  const cells = Object.values(m.rows[0]?.cells ?? {});
  return { student, topics: cells, ...summarizeStudentMastery(cells) };
}

/** Per-student early-warning stats for one class (scores, overdue work, absences in 30 days). */
async function riskStatsForClass(classId: string): Promise<StudentRiskStats[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const students = await activeStudents(classId);
  const ids = students.map((s) => s.id);
  const [subs, overdue, absences, sessionCount] = await Promise.all([
    prisma.submission.findMany({
      where: { studentId: { in: ids }, assignment: { classId }, status: { in: [...FINISHED] }, totalScore: { not: null } },
      orderBy: { submittedAt: "asc" },
      select: { studentId: true, assignmentId: true, attemptNo: true, totalScore: true, maxScore: true, submittedAt: true },
    }),
    prisma.assignment.findMany({
      where: { classId, dueAt: { gte: since, lt: now } },
      select: {
        id: true,
        targets: { select: { studentId: true } },
        submissions: { where: { status: { in: [...FINISHED] } }, select: { studentId: true } },
      },
    }),
    prisma.attendanceRecord.groupBy({
      by: ["studentId"],
      where: { status: "ABSENT", studentId: { in: ids }, session: { classId, startsAt: { gte: since } } },
      _count: { _all: true },
    }),
    prisma.attendanceRecord.count({ where: { session: { classId, startsAt: { gte: since } } } }),
  ]);

  // latest attempt per assignment, in submission order
  const latest = new Map<string, (typeof subs)[number]>();
  for (const s of subs) {
    const k = `${s.studentId}:${s.assignmentId}`;
    const prev = latest.get(k);
    if (!prev || s.attemptNo > prev.attemptNo) latest.set(k, s);
  }
  const scoresByStudent = new Map<string, Array<{ at: number; v: number }>>();
  for (const s of latest.values()) {
    if (!(s.maxScore > 0) || s.totalScore === null) continue;
    const list = scoresByStudent.get(s.studentId) ?? [];
    list.push({ at: s.submittedAt?.getTime() ?? 0, v: Math.round(((s.totalScore / s.maxScore) * 10) * 100) / 100 });
    scoresByStudent.set(s.studentId, list);
  }
  const absentMap = new Map(absences.map((a) => [a.studentId, a._count._all]));

  return students.map((st) => ({
    student: st,
    recentScores10: (scoresByStudent.get(st.id) ?? []).sort((a, b) => a.at - b.at).map((x) => x.v),
    missingCount: overdue.filter(
      (a) =>
        (a.targets.length === 0 || a.targets.some((t) => t.studentId === st.id)) &&
        !a.submissions.some((s) => s.studentId === st.id)
    ).length,
    absentCount: sessionCount > 0 ? (absentMap.get(st.id) ?? 0) : null,
  }));
}

export async function getClassAtRiskStudents(classId: string) {
  return cached(`atrisk:${classId}`, async () => {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { atRiskScoreThreshold: true, atRiskMissingCount: true },
    });
    if (!cls) throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
    const list = detectAtRiskStudents(await riskStatsForClass(classId), {
      scoreThreshold: cls.atRiskScoreThreshold,
      missingCount: cls.atRiskMissingCount,
    });
    return {
      config: { scoreThreshold: cls.atRiskScoreThreshold, missingCount: cls.atRiskMissingCount },
      students: list,
    };
  });
}

/** Teacher dashboard: at-risk students across every class the teacher owns or co-teaches. */
export async function getTeacherAtRiskSummary(viewer: Viewer) {
  const classes = await prisma.class.findMany({
    where: {
      deletedAt: null,
      archived: false,
      ...(viewer.role === "ADMIN" ? { teacherId: viewer.id } : { OR: [{ teacherId: viewer.id }, { classTeachers: { some: { userId: viewer.id } } }] }),
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, name: true },
  });
  const rows: Array<{ classId: string; className: string } & Awaited<ReturnType<typeof getClassAtRiskStudents>>["students"][number]> = [];
  for (const c of classes) {
    const r = await getClassAtRiskStudents(c.id);
    for (const s of r.students) rows.push({ classId: c.id, className: c.name, ...s });
  }
  rows.sort((a, b) => (a.level === b.level ? b.reasons.length - a.reasons.length : a.level === "HIGH" ? -1 : 1));
  return { total: rows.length, highCount: rows.filter((r) => r.level === "HIGH").length, students: rows.slice(0, 15) };
}

export async function updateClassAtRiskConfig(classId: string, input: { scoreThreshold?: number; missingCount?: number }) {
  await prisma.class.update({
    where: { id: classId },
    data: {
      ...(input.scoreThreshold !== undefined ? { atRiskScoreThreshold: input.scoreThreshold } : {}),
      ...(input.missingCount !== undefined ? { atRiskMissingCount: input.missingCount } : {}),
    },
  });
  cache.delete(`atrisk:${classId}`);
  return { ok: true };
}

/**
 * One-tap remedial work: picks auto-gradable question-bank items for the weak topics (round-robin
 * across topics), builds a "[Ôn bù] ..." worksheet and assigns it ONLY to the chosen students.
 */
export async function createRemedialAssignmentFromWeakTopics(
  classId: string,
  actor: Viewer,
  input: { topicTags: string[]; studentIds: string[]; questionCount: number; dueAt?: string | null }
) {
  const topicTags = Array.from(new Set(input.topicTags.map((t) => t.trim()).filter(Boolean))).slice(0, 10);
  if (topicTags.length === 0) throw new AppError("Hãy chọn ít nhất 1 chủ đề.", 400, "VALIDATION_ERROR");

  const enrolled = await prisma.enrollment.findMany({
    where: { classId, status: "ACTIVE", studentId: { in: input.studentIds }, student: { deletedAt: null } },
    select: { studentId: true },
  });
  const studentIds = enrolled.map((e) => e.studentId);
  if (studentIds.length === 0) throw new AppError("Không có học sinh hợp lệ trong lớp.", 400, "NO_VALID_STUDENTS");

  const isAdmin = actor.role === "ADMIN";
  const skillTags = topicTags.filter((t): t is SkillTag => (Object.values(SkillTag) as string[]).includes(t));
  const pool = await prisma.questionBankItem.findMany({
    where: {
      deletedAt: null,
      ...(isAdmin ? {} : { OR: [{ ownerId: actor.id }, { isShared: true }] }),
      imageKey: null,
      audioKey: null,
      AND: [{ OR: [{ topicTag: { in: topicTags } }, ...(skillTags.length ? [{ skillTag: { in: skillTags } }] : [])] }],
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const usable = pool.filter((q) => !isManualFieldType(q.type));
  const byTag = new Map<string, typeof usable>();
  for (const q of usable) {
    const tag = q.topicTag && topicTags.includes(q.topicTag) ? q.topicTag : (q.skillTag as string);
    const list = byTag.get(tag) ?? [];
    list.push(q);
    byTag.set(tag, list);
  }
  for (const list of byTag.values()) list.sort(() => Math.random() - 0.5);
  const want = Math.max(1, Math.min(40, input.questionCount));
  const picked: typeof usable = [];
  while (picked.length < want) {
    let added = false;
    for (const tag of topicTags) {
      const q = byTag.get(tag)?.shift();
      if (q && picked.length < want) {
        picked.push(q);
        added = true;
      }
    }
    if (!added) break;
  }
  if (picked.length === 0) {
    throw new AppError(
      "Ngân hàng câu hỏi chưa có câu tự chấm nào cho các chủ đề này.",
      400,
      "REMEDIAL_NO_QUESTIONS"
    );
  }

  const title = `[Ôn bù] ${topicTags.map((t) => masteryTagLabel(t, "vi").label).join(", ")}`.slice(0, 190);
  const ws = await prisma.worksheet.create({
    data: {
      ownerId: actor.id,
      title,
      subject: picked[0]!.subject,
      instructions: "Bài ôn tập các chủ đề còn yếu. / Review practice for weak topics.",
      fields: {
        create: picked.map((q, i) => ({
          placement: "ANSWER_SHEET" as const,
          type: q.type,
          label: String(i + 1),
          prompt: q.prompt,
          explanation: q.explanation,
          skillTag: q.skillTag,
          topicTag: q.topicTag,
          bankItemId: q.id,
          order: i,
          points: 1,
          options: (q.options ?? undefined) as Prisma.InputJsonValue | undefined,
          answerKey: q.answerKey as Prisma.InputJsonValue,
        })),
      },
    },
  });

  const settings = createAssignmentSchema.parse({
    worksheetId: ws.id,
    classIds: [classId],
    title,
    dueAt: input.dueAt || null,
    maxAttempts: null,
    showResult: "AFTER_SUBMIT",
    showAnswerKey: true,
    targetStudentIds: studentIds,
  });
  const [assignment] = await createAssignmentsForClasses(actor.id, isAdmin, settings);
  if (!assignment) throw new AppError("Không thể giao bài ôn bù.", 500, "REMEDIAL_FAILED");

  await prisma.remedialPlanLog.create({
    data: {
      classId,
      createdById: actor.id,
      topicTags: topicTags as Prisma.InputJsonValue,
      targetStudentIds: studentIds as Prisma.InputJsonValue,
      assignmentId: assignment.id,
    },
  });
  return { assignmentId: assignment.id, worksheetId: ws.id, questionCount: picked.length, studentCount: studentIds.length };
}
