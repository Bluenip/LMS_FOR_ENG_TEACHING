import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

export interface PreCheckInput {
  assignmentId?: string | null;
  browserInfo: string;
  pingMs?: number | null;
  cameraOk: boolean;
  micOk: boolean;
  batteryPct?: number | null;
}

/** Device is ready when camera/mic pass (if the exam needs them), ping < 800 ms and battery ≥ 20 % (or charging/unknown). */
export function evaluatePreCheck(input: PreCheckInput, needs: { camera: boolean; mic: boolean }): boolean {
  if (needs.camera && !input.cameraOk) return false;
  if (needs.mic && !input.micOk) return false;
  if (input.pingMs !== null && input.pingMs !== undefined && input.pingMs > 800) return false;
  if (input.batteryPct !== null && input.batteryPct !== undefined && input.batteryPct < 20) return false;
  return true;
}

export async function savePreCheck(userId: string, input: PreCheckInput) {
  let needs = { camera: false, mic: false };
  if (input.assignmentId) {
    const a = await prisma.assignment.findUnique({
      where: { id: input.assignmentId },
      select: { requireCamera: true, requireMicMonitor: true, classId: true },
    });
    if (!a) throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
    const enr = await prisma.enrollment.findUnique({ where: { classId_studentId: { classId: a.classId, studentId: userId } }, select: { status: true } });
    if (enr?.status !== "ACTIVE") throw new AppError("Bạn không thuộc lớp được giao bài tập này.", 403, "FORBIDDEN");
    needs = { camera: a.requireCamera, mic: a.requireMicMonitor };
  }
  const passed = evaluatePreCheck(input, needs);
  const row = await prisma.systemPreCheckLog.create({
    data: {
      userId,
      assignmentId: input.assignmentId ?? null,
      browserInfo: input.browserInfo.slice(0, 300),
      pingMs: input.pingMs ?? null,
      cameraOk: input.cameraOk,
      micOk: input.micOk,
      batteryPct: input.batteryPct ?? null,
      passed,
    },
  });
  return { id: row.id, passed, needs };
}

/** Teacher view: latest device check per student (for this exam, or any in the last 24 h). */
export async function listPreChecksForAssignment(assignmentId: string) {
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { classId: true } });
  if (!a) throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  const students = await prisma.enrollment.findMany({
    where: { classId: a.classId, status: "ACTIVE", student: { deletedAt: null } },
    orderBy: { student: { name: "asc" } },
    select: { student: { select: { id: true, name: true } } },
  });
  const since = new Date(Date.now() - 86_400_000);
  const logs = await prisma.systemPreCheckLog.findMany({
    where: { userId: { in: students.map((s) => s.student.id) }, OR: [{ assignmentId }, { assignmentId: null, checkedAt: { gte: since } }] },
    orderBy: { checkedAt: "desc" },
  });
  return students.map(({ student }) => {
    const last = logs.find((l) => l.userId === student.id);
    return {
      student,
      check: last
        ? { passed: last.passed, pingMs: last.pingMs, cameraOk: last.cameraOk, micOk: last.micOk, batteryPct: last.batteryPct, browserInfo: last.browserInfo, checkedAt: last.checkedAt.toISOString() }
        : null,
    };
  });
}
