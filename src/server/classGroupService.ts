import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

function groupDTO(g: {
  id: string;
  classId: string;
  name: string;
  createdAt: Date;
  members: Array<{ studentId: string; isLeader: boolean; student: { name: string } }>;
}) {
  return {
    id: g.id,
    classId: g.classId,
    name: g.name,
    createdAt: g.createdAt.toISOString(),
    members: g.members
      .map((m) => ({ studentId: m.studentId, name: m.student.name, isLeader: m.isLeader }))
      .sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.name.localeCompare(b.name)),
  };
}

const INCLUDE = { members: { include: { student: { select: { name: true } } } } } as const;

export async function listClassGroups(classId: string) {
  const groups = await prisma.classGroup.findMany({ where: { classId }, orderBy: { name: "asc" }, include: INCLUDE });
  return groups.map(groupDTO);
}

async function activeStudentIds(classId: string, ids: string[]): Promise<string[]> {
  const rows = await prisma.enrollment.findMany({
    where: { classId, status: "ACTIVE", studentId: { in: ids }, student: { deletedAt: null } },
    select: { studentId: true },
  });
  return rows.map((r) => r.studentId);
}

/** Sets the members of a group; a student belongs to at most one group per class (moved if needed). */
async function setMembers(classId: string, groupId: string, studentIds: string[], leaderId?: string | null) {
  const valid = await activeStudentIds(classId, Array.from(new Set(studentIds)));
  await prisma.$transaction(async (tx) => {
    await tx.classGroupMember.deleteMany({ where: { studentId: { in: valid }, group: { classId }, NOT: { groupId } } });
    await tx.classGroupMember.deleteMany({ where: { groupId, studentId: { notIn: valid } } });
    for (const sid of valid) {
      await tx.classGroupMember.upsert({
        where: { groupId_studentId: { groupId, studentId: sid } },
        create: { groupId, studentId: sid, isLeader: sid === leaderId },
        update: { isLeader: sid === leaderId },
      });
    }
    if (leaderId && !valid.includes(leaderId)) {
      throw new AppError("Nhóm trưởng phải là thành viên của nhóm.", 400, "VALIDATION_ERROR");
    }
  });
}

export async function createClassGroup(classId: string, input: { name: string; studentIds: string[]; leaderId?: string | null }) {
  const g = await prisma.classGroup.create({ data: { classId, name: input.name.trim().slice(0, 60) } });
  await setMembers(classId, g.id, input.studentIds, input.leaderId ?? input.studentIds[0] ?? null);
  return groupDTO(await prisma.classGroup.findUniqueOrThrow({ where: { id: g.id }, include: INCLUDE }));
}

export async function updateClassGroup(
  classId: string,
  groupId: string,
  input: { name?: string; studentIds?: string[]; leaderId?: string | null }
) {
  const g = await prisma.classGroup.findFirst({ where: { id: groupId, classId } });
  if (!g) throw new AppError("Không tìm thấy nhóm.", 404, "NOT_FOUND");
  if (input.name) await prisma.classGroup.update({ where: { id: groupId }, data: { name: input.name.trim().slice(0, 60) } });
  if (input.studentIds) await setMembers(classId, groupId, input.studentIds, input.leaderId ?? input.studentIds[0] ?? null);
  return groupDTO(await prisma.classGroup.findUniqueOrThrow({ where: { id: groupId }, include: INCLUDE }));
}

export async function deleteClassGroup(classId: string, groupId: string) {
  const used = await prisma.submission.count({ where: { groupId } });
  if (used > 0) {
    throw new AppError("Nhóm đã có bài nộp chung, không thể xoá.", 409, "GROUP_HAS_SUBMISSIONS");
  }
  const res = await prisma.classGroup.deleteMany({ where: { id: groupId, classId } });
  if (res.count === 0) throw new AppError("Không tìm thấy nhóm.", 404, "NOT_FOUND");
  return { ok: true };
}

/** Random split of all ACTIVE students into groups of ~groupSize (replaces groups without submissions). */
export async function autoAssignClassGroups(classId: string, input: { groupSize: number }, rng: () => number = Math.random) {
  const size = Math.max(2, Math.min(10, Math.floor(input.groupSize)));
  const locked = await prisma.classGroup.count({ where: { classId, submissions: { some: {} } } });
  if (locked > 0) {
    throw new AppError("Lớp đã có nhóm nộp bài chung, không thể chia lại toàn bộ.", 409, "GROUP_HAS_SUBMISSIONS");
  }
  const students = await prisma.enrollment.findMany({
    where: { classId, status: "ACTIVE", student: { deletedAt: null } },
    select: { studentId: true },
  });
  const ids = students.map((s) => s.studentId);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  const count = Math.max(1, Math.round(ids.length / size));
  const buckets: string[][] = Array.from({ length: count }, () => []);
  ids.forEach((id, i) => buckets[i % count]!.push(id));
  await prisma.classGroup.deleteMany({ where: { classId } });
  for (const [i, members] of buckets.entries()) {
    if (members.length === 0) continue;
    const g = await prisma.classGroup.create({ data: { classId, name: `Nhóm ${i + 1}` } });
    await prisma.classGroupMember.createMany({
      data: members.map((studentId, k) => ({ groupId: g.id, studentId, isLeader: k === 0 })),
    });
  }
  return listClassGroups(classId);
}

export async function getStudentGroupInClass(classId: string, studentId: string) {
  const m = await prisma.classGroupMember.findFirst({
    where: { studentId, group: { classId } },
    select: { group: { select: { id: true, name: true } } },
  });
  return m?.group ?? null;
}

/** True when the student owns the submission or belongs to its group (group assignments). */
export async function isSubmissionParticipant(
  submission: { studentId: string; groupId?: string | null },
  studentId: string
): Promise<boolean> {
  if (submission.studentId === studentId) return true;
  if (!submission.groupId) return false;
  const m = await prisma.classGroupMember.findUnique({
    where: { groupId_studentId: { groupId: submission.groupId, studentId } },
    select: { studentId: true },
  });
  return Boolean(m);
}

/** Group ids the student is in (any class). */
export async function getStudentGroupIds(studentId: string): Promise<string[]> {
  const rows = await prisma.classGroupMember.findMany({ where: { studentId }, select: { groupId: true } });
  return rows.map((r) => r.groupId);
}

/** Score credited to one member of a group submission (teacher override wins). */
export function memberScore(totalScore: number | null, overrides: unknown, studentId: string): number | null {
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    const v = (overrides as Record<string, unknown>)[studentId];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return totalScore;
}

export async function setMemberScoreOverrides(submissionId: string, overrides: Record<string, number | null>) {
  const sub = await prisma.submission.findUnique({ where: { id: submissionId }, select: { groupId: true, maxScore: true, memberScoreOverrides: true } });
  if (!sub?.groupId) throw new AppError("Đây không phải bài nộp nhóm.", 400, "NOT_GROUP_SUBMISSION");
  const members = new Set(
    (await prisma.classGroupMember.findMany({ where: { groupId: sub.groupId }, select: { studentId: true } })).map((m) => m.studentId)
  );
  const next: Record<string, number> = { ...((sub.memberScoreOverrides as Record<string, number> | null) ?? {}) };
  for (const [sid, v] of Object.entries(overrides)) {
    if (!members.has(sid)) throw new AppError("Học sinh không thuộc nhóm này.", 400, "VALIDATION_ERROR");
    if (v === null) delete next[sid];
    else next[sid] = Math.max(0, Math.min(sub.maxScore, v));
  }
  await prisma.submission.update({ where: { id: submissionId }, data: { memberScoreOverrides: next } });
  return { memberScoreOverrides: next };
}
