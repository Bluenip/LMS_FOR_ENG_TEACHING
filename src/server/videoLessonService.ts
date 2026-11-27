import type { FieldType, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { gradeField, type AnswerValue } from "@/lib/grading";

interface Actor {
  id: string;
  role: Role;
}

export const CHECKPOINT_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "TEXT"] as const;
/** Max progress a single heartbeat may add (seconds): blocks skipping ahead on the first viewing. */
export const HEARTBEAT_MAX_ADVANCE_SEC = 20;

type CheckpointAnswers = Record<string, { answer: unknown; isCorrect: boolean; at: string }>;

async function loadVideoItem(itemId: string) {
  const item = await prisma.lessonItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      type: true,
      title: true,
      deletedAt: true,
      lesson: { select: { id: true, ownerId: true, classId: true, deletedAt: true, classLinks: { select: { classId: true } } } },
    },
  });
  if (!item || item.deletedAt || item.lesson.deletedAt) throw new AppError("Không tìm thấy bài giảng.", 404, "NOT_FOUND");
  if (item.type !== "VIDEO") throw new AppError("Chỉ video mới gắn được câu hỏi tương tác.", 400, "NOT_VIDEO");
  return item;
}

async function assertOwner(itemId: string, actor: Actor) {
  const item = await loadVideoItem(itemId);
  if (actor.role !== "ADMIN" && item.lesson.ownerId !== actor.id) {
    throw new AppError("Bạn không có quyền chỉnh sửa bài giảng này.", 403, "FORBIDDEN");
  }
  return item;
}

async function assertStudentAccess(itemId: string, studentId: string) {
  const item = await loadVideoItem(itemId);
  const classIds = [...item.lesson.classLinks.map((c) => c.classId), ...(item.lesson.classId ? [item.lesson.classId] : [])];
  const enrolled = await prisma.enrollment.findFirst({
    where: { studentId, status: "ACTIVE", classId: { in: classIds }, class: { deletedAt: null } },
    select: { id: true },
  });
  if (!enrolled) throw new AppError("Bạn không có quyền xem bài giảng này.", 403, "FORBIDDEN");
  return item;
}

function checkpointDTO(c: {
  id: string;
  timestampSec: number;
  type: FieldType;
  prompt: string;
  options: Prisma.JsonValue;
  answerKey: Prisma.JsonValue;
  order: number;
}) {
  return { id: c.id, timestampSec: c.timestampSec, type: c.type, prompt: c.prompt, options: c.options, answerKey: c.answerKey, order: c.order };
}

export async function listCheckpointsForOwner(itemId: string, actor: Actor) {
  await assertOwner(itemId, actor);
  const rows = await prisma.lessonVideoCheckpoint.findMany({ where: { lessonItemId: itemId }, orderBy: [{ timestampSec: "asc" }, { order: "asc" }] });
  const progress = await prisma.lessonVideoProgress.findMany({
    where: { lessonItemId: itemId },
    select: { maxWatchedSec: true, durationSec: true, completed: true, student: { select: { id: true, name: true } } },
  });
  return {
    checkpoints: rows.map(checkpointDTO),
    progress: progress.map((p) => ({
      student: p.student,
      watchedPct: p.durationSec > 0 ? Math.min(100, Math.round((p.maxWatchedSec / p.durationSec) * 100)) : 0,
      completed: p.completed,
    })),
  };
}

export async function createCheckpoint(
  itemId: string,
  actor: Actor,
  input: { timestampSec: number; type: (typeof CHECKPOINT_TYPES)[number]; prompt: string; options?: Array<{ id: string; text: string }> | null; answerKey?: unknown }
) {
  await assertOwner(itemId, actor);
  const count = await prisma.lessonVideoCheckpoint.count({ where: { lessonItemId: itemId } });
  if (count >= 30) throw new AppError("Mỗi video tối đa 30 câu hỏi.", 400, "CHECKPOINT_LIMIT");
  const c = await prisma.lessonVideoCheckpoint.create({
    data: {
      lessonItemId: itemId,
      timestampSec: Math.max(0, Math.round(input.timestampSec)),
      type: input.type,
      prompt: input.prompt.trim().slice(0, 1000),
      options: (input.options ?? undefined) as Prisma.InputJsonValue | undefined,
      answerKey: (input.answerKey ?? undefined) as Prisma.InputJsonValue | undefined,
      order: count,
    },
  });
  return checkpointDTO(c);
}

export async function deleteCheckpoint(itemId: string, actor: Actor, checkpointId: string) {
  await assertOwner(itemId, actor);
  const res = await prisma.lessonVideoCheckpoint.deleteMany({ where: { id: checkpointId, lessonItemId: itemId } });
  if (res.count === 0) throw new AppError("Không tìm thấy câu hỏi.", 404, "NOT_FOUND");
  return { ok: true };
}

/** Student view: answer keys are only included for checkpoints the student already answered. */
export async function getLessonVideoForStudent(itemId: string, studentId: string) {
  await assertStudentAccess(itemId, studentId);
  const [cps, progress] = await Promise.all([
    prisma.lessonVideoCheckpoint.findMany({ where: { lessonItemId: itemId }, orderBy: [{ timestampSec: "asc" }, { order: "asc" }] }),
    prisma.lessonVideoProgress.findUnique({ where: { lessonItemId_studentId: { lessonItemId: itemId, studentId } } }),
  ]);
  const answers = (progress?.checkpointAnswers as CheckpointAnswers | null) ?? {};
  return {
    checkpoints: cps.map((c) => {
      const mine = answers[c.id];
      return {
        id: c.id,
        timestampSec: c.timestampSec,
        type: c.type,
        prompt: c.prompt,
        options: c.options,
        answered: Boolean(mine),
        myAnswer: mine?.answer ?? null,
        isCorrect: mine?.isCorrect ?? null,
        answerKey: mine ? c.answerKey : null,
      };
    }),
    progress: {
      maxWatchedSec: progress?.maxWatchedSec ?? 0,
      durationSec: progress?.durationSec ?? 0,
      completed: progress?.completed ?? false,
    },
  };
}

async function recomputeCompleted(itemId: string, studentId: string) {
  const [p, total] = await Promise.all([
    prisma.lessonVideoProgress.findUnique({ where: { lessonItemId_studentId: { lessonItemId: itemId, studentId } } }),
    prisma.lessonVideoCheckpoint.count({ where: { lessonItemId: itemId } }),
  ]);
  if (!p) return false;
  const answered = Object.keys((p.checkpointAnswers as CheckpointAnswers | null) ?? {}).length;
  const watched = p.durationSec > 0 && p.maxWatchedSec >= p.durationSec * 0.95;
  const completed = watched && answered >= total;
  if (completed !== p.completed) {
    await prisma.lessonVideoProgress.update({ where: { id: p.id }, data: { completed } });
  }
  return completed;
}

export async function submitCheckpointAnswer(itemId: string, studentId: string, checkpointId: string, answer: unknown) {
  await assertStudentAccess(itemId, studentId);
  const cp = await prisma.lessonVideoCheckpoint.findFirst({ where: { id: checkpointId, lessonItemId: itemId } });
  if (!cp) throw new AppError("Không tìm thấy câu hỏi.", 404, "NOT_FOUND");
  const progress = await prisma.lessonVideoProgress.upsert({
    where: { lessonItemId_studentId: { lessonItemId: itemId, studentId } },
    create: { lessonItemId: itemId, studentId },
    update: {},
  });
  const answers = (progress.checkpointAnswers as CheckpointAnswers | null) ?? {};
  if (answers[checkpointId]) throw new AppError("Bạn đã trả lời câu này rồi.", 409, "CHECKPOINT_ANSWERED");
  if (progress.maxWatchedSec + 2 < cp.timestampSec) {
    throw new AppError("Hãy xem tới đoạn này trước khi trả lời.", 409, "CHECKPOINT_NOT_REACHED");
  }
  const res = cp.answerKey
    ? gradeField({ id: cp.id, type: cp.type, points: 1, options: cp.options, answerKey: cp.answerKey }, answer as AnswerValue)
    : { isCorrect: true };
  const isCorrect = res.isCorrect === true;
  answers[checkpointId] = { answer: answer as Prisma.JsonValue, isCorrect, at: new Date().toISOString() };
  await prisma.lessonVideoProgress.update({
    where: { id: progress.id },
    data: { checkpointAnswers: answers as unknown as Prisma.InputJsonValue },
  });
  const completed = await recomputeCompleted(itemId, studentId);
  return { isCorrect, answerKey: cp.answerKey, completed };
}

/**
 * Periodic watch heartbeat. The furthest watched point can only advance by a small step per call,
 * so dragging the seek bar ahead does not count as watched on the first viewing.
 */
export async function reportVideoHeartbeat(itemId: string, studentId: string, input: { currentSec: number; durationSec: number }) {
  await assertStudentAccess(itemId, studentId);
  const prev = await prisma.lessonVideoProgress.findUnique({ where: { lessonItemId_studentId: { lessonItemId: itemId, studentId } } });
  const prevMax = prev?.maxWatchedSec ?? 0;
  const duration = Math.max(prev?.durationSec ?? 0, Math.round(Math.max(0, input.durationSec)));
  const target = Math.round(Math.max(0, input.currentSec));
  const nextMax = Math.min(duration || target, Math.max(prevMax, Math.min(target, prevMax + HEARTBEAT_MAX_ADVANCE_SEC)));
  await prisma.lessonVideoProgress.upsert({
    where: { lessonItemId_studentId: { lessonItemId: itemId, studentId } },
    create: { lessonItemId: itemId, studentId, maxWatchedSec: nextMax, durationSec: duration },
    update: { maxWatchedSec: nextMax, durationSec: duration },
  });
  const completed = await recomputeCompleted(itemId, studentId);
  return { maxWatchedSec: nextMax, durationSec: duration, completed };
}
