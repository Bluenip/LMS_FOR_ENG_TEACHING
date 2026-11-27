import crypto from "crypto";
import { Prisma, type LiveQuizMode, type LiveQuizStatus, type Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hasMinClassRole } from "@/lib/class-roles";
import { gradeField, normalizeText, type AnswerValue, type FieldOption } from "@/lib/grading";
import { generateLiveQuizPin, sanitizeLiveQuestionForPlayer } from "@/lib/live-quiz/pin";
import { computeLiveQuizPoints, liveQuizRatioToScore } from "@/lib/live-quiz/scoring";
import { publishLiveQuizEvent } from "@/lib/live-quiz/live-bus";
import {
  isLiveQuizFieldType,
  parseSnapshot,
  type LiveQuizSnapshotQuestion,
} from "@/lib/live-quiz/types";
import { resolveUserClassRole } from "./classRoleHelper";
import { createOfflineGradeColumn, saveOfflineGradeEntries } from "./offlineGradeService";

export interface LiveQuizActor {
  id: string;
  role: Role;
}

export interface LiveQuizParticipantAuth {
  userId?: string | null;
  joinToken?: string | null;
}

export const LIVE_QUIZ_MAX_QUESTIONS = 50;
/** Network latency tolerance after the countdown ends (HOST_PACED). */
const LATE_GRACE_MS = 1500;
const SELF_PACED_LIMIT_CAP_MS = 10 * 60 * 1000;

export function hashJoinToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newJoinToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

async function pinExists(pin: string): Promise<boolean> {
  const found = await prisma.liveQuizSession.findUnique({ where: { pinCode: pin }, select: { id: true } });
  return Boolean(found);
}

async function assertCanUseClass(actor: LiveQuizActor, classId: string) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, teacherId: true, deletedAt: true },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }
  const role = await resolveUserClassRole(cls.id, actor.id, actor.role, cls.teacherId);
  if (!hasMinClassRole(role, "ASSISTANT")) {
    throw new AppError("Bạn không có quyền quản lý lớp học này.", 403, "FORBIDDEN");
  }
}

/** Host, platform admin, or a co-teacher/assistant of the session's class may control it. */
export async function canControlLiveQuiz(
  actor: LiveQuizActor,
  session: { hostId: string; classId: string | null }
): Promise<boolean> {
  if (actor.role === "ADMIN" || actor.id === session.hostId) return true;
  if (actor.role !== "TEACHER" || !session.classId) return false;
  const cls = await prisma.class.findUnique({
    where: { id: session.classId },
    select: { teacherId: true, deletedAt: true },
  });
  if (!cls || cls.deletedAt) return false;
  const role = await resolveUserClassRole(session.classId, actor.id, actor.role, cls.teacherId);
  return hasMinClassRole(role, "ASSISTANT");
}

async function loadSessionForHost(sessionId: string, actor: LiveQuizActor) {
  const session = await prisma.liveQuizSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new AppError("Không tìm thấy phiên Live Quiz.", 404, "NOT_FOUND");
  }
  if (!(await canControlLiveQuiz(actor, session))) {
    throw new AppError("Bạn không có quyền điều khiển phiên Live Quiz này.", 403, "FORBIDDEN");
  }
  return session;
}

function clampLimitSec(value: number | undefined): number {
  const v = Number.isFinite(value) ? Math.round(value as number) : 30;
  return Math.min(300, Math.max(5, v));
}

export async function createLiveQuizFromWorksheet(
  actor: LiveQuizActor,
  input: {
    worksheetId: string;
    classId?: string | null;
    mode?: LiveQuizMode;
    questionLimitSec?: number;
    title?: string | null;
  }
) {
  const worksheet = await prisma.worksheet.findUnique({
    where: { id: input.worksheetId },
    select: {
      id: true,
      title: true,
      ownerId: true,
      isShared: true,
      deletedAt: true,
      fields: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          type: true,
          label: true,
          prompt: true,
          imageKey: true,
          options: true,
          answerKey: true,
          gradingOpts: true,
        },
      },
    },
  });
  if (!worksheet || worksheet.deletedAt) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }
  if (actor.role !== "ADMIN" && worksheet.ownerId !== actor.id && !worksheet.isShared) {
    throw new AppError("Bạn không có quyền dùng phiếu bài tập này.", 403, "FORBIDDEN");
  }
  if (input.classId) await assertCanUseClass(actor, input.classId);

  const limitSec = clampLimitSec(input.questionLimitSec);
  const questions: LiveQuizSnapshotQuestion[] = worksheet.fields
    .filter((f) => isLiveQuizFieldType(f.type))
    .slice(0, LIVE_QUIZ_MAX_QUESTIONS)
    .map((f) => ({
      id: f.id,
      type: f.type as LiveQuizSnapshotQuestion["type"],
      prompt: (f.prompt?.trim() || f.label || "").slice(0, 2000),
      options: Array.isArray(f.options) ? (f.options as unknown as FieldOption[]) : null,
      imageKey: f.imageKey ?? null,
      timeLimitSec: limitSec,
      answerKey: f.answerKey,
      gradingOpts: (f.gradingOpts as LiveQuizSnapshotQuestion["gradingOpts"]) ?? null,
    }));

  if (questions.length === 0) {
    throw new AppError(
      "Phiếu bài tập không có câu tự chấm nào dùng được cho Live Quiz.",
      400,
      "LIVE_QUIZ_NO_QUESTIONS"
    );
  }

  const pinCode = await generateLiveQuizPin(pinExists);
  const session = await prisma.liveQuizSession.create({
    data: {
      hostId: actor.id,
      classId: input.classId ?? null,
      worksheetId: worksheet.id,
      title: (input.title?.trim() || worksheet.title).slice(0, 200),
      pinCode,
      mode: input.mode ?? "HOST_PACED",
      questionLimitSec: limitSec,
      questionsSnapshot: questions as unknown as Prisma.InputJsonValue,
    },
  });
  return { id: session.id, pinCode: session.pinCode, questionCount: questions.length };
}

const OPTION_IDS = ["A", "B", "C", "D", "E", "F"];

export async function createExitTicketSession(
  actor: LiveQuizActor,
  input: {
    classId?: string | null;
    title: string;
    type: "MULTIPLE_CHOICE" | "TEXT";
    prompt: string;
    options?: string[];
    /** MULTIPLE_CHOICE: index of the correct option. */
    correctIndex?: number | null;
    /** TEXT: accepted answers (optional; without them the ticket is an open-ended poll). */
    acceptedAnswers?: string[];
    questionLimitSec?: number;
  }
) {
  if (input.classId) await assertCanUseClass(actor, input.classId);

  let options: FieldOption[] | null = null;
  let answerKey: unknown = null;
  if (input.type === "MULTIPLE_CHOICE") {
    const texts = (input.options ?? []).map((t) => t.trim()).filter(Boolean);
    if (texts.length < 2 || texts.length > OPTION_IDS.length) {
      throw new AppError("Câu trắc nghiệm cần từ 2 đến 6 phương án.", 400, "VALIDATION_ERROR");
    }
    options = texts.map((text, i) => ({ id: OPTION_IDS[i]!, text }));
    if (input.correctIndex !== null && input.correctIndex !== undefined) {
      const opt = options[input.correctIndex];
      if (!opt) throw new AppError("Đáp án đúng không hợp lệ.", 400, "VALIDATION_ERROR");
      answerKey = { correct: opt.id };
    }
  } else {
    const accepted = (input.acceptedAnswers ?? []).map((a) => a.trim()).filter(Boolean);
    if (accepted.length > 0) answerKey = { accepted };
  }

  const limitSec = clampLimitSec(input.questionLimitSec ?? 60);
  const question: LiveQuizSnapshotQuestion = {
    id: "exit-1",
    type: input.type,
    prompt: input.prompt.trim().slice(0, 2000),
    options,
    imageKey: null,
    timeLimitSec: limitSec,
    answerKey,
    gradingOpts: null,
  };

  const pinCode = await generateLiveQuizPin(pinExists);
  const session = await prisma.liveQuizSession.create({
    data: {
      hostId: actor.id,
      classId: input.classId ?? null,
      title: input.title.trim().slice(0, 200),
      pinCode,
      isExitTicket: true,
      questionLimitSec: limitSec,
      questionsSnapshot: [question] as unknown as Prisma.InputJsonValue,
    },
  });
  return { id: session.id, pinCode: session.pinCode, questionCount: 1 };
}

export async function listLiveQuizSessions(actor: LiveQuizActor, opts: { classId?: string | null } = {}) {
  if (opts.classId) await assertCanUseClass(actor, opts.classId);
  const rows = await prisma.liveQuizSession.findMany({
    where: opts.classId
      ? { classId: opts.classId }
      : actor.role === "ADMIN"
        ? {}
        : { hostId: actor.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      pinCode: true,
      status: true,
      mode: true,
      isExitTicket: true,
      classId: true,
      createdAt: true,
      endedAt: true,
      class: { select: { name: true } },
      _count: { select: { participants: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    pinCode: r.pinCode,
    status: r.status,
    mode: r.mode,
    isExitTicket: r.isExitTicket,
    classId: r.classId,
    className: r.class?.name ?? null,
    participantCount: r._count.participants,
    createdAt: r.createdAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
  }));
}

export async function joinLiveQuiz(
  pinCode: string,
  input: { user?: { id: string; name: string; role: Role } | null; displayName?: string | null }
) {
  const session = await prisma.liveQuizSession.findUnique({
    where: { pinCode },
    select: { id: true, status: true, classId: true, title: true },
  });
  if (!session || session.status === "FINISHED") {
    throw new AppError("Mã PIN không đúng hoặc phiên đã kết thúc.", 404, "LIVE_QUIZ_NOT_FOUND");
  }

  const user = input.user ?? null;
  if (session.classId) {
    if (!user) {
      throw new AppError("Hãy đăng nhập để tham gia Live Quiz của lớp.", 401, "LIVE_QUIZ_LOGIN_REQUIRED");
    }
    const enrollment = await prisma.enrollment.findUnique({
      where: { classId_studentId: { classId: session.classId, studentId: user.id } },
      select: { status: true },
    });
    if (!enrollment || enrollment.status !== "ACTIVE") {
      throw new AppError("Bạn không thuộc lớp của phiên Live Quiz này.", 403, "LIVE_QUIZ_NOT_IN_CLASS");
    }
  }

  const displayName = (user?.name ?? input.displayName ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!displayName) {
    throw new AppError("Vui lòng nhập tên hiển thị.", 400, "VALIDATION_ERROR");
  }

  const joinToken = newJoinToken();
  const joinTokenHash = hashJoinToken(joinToken);

  // Logged-in users re-joining (refresh / another device) keep their score; the old token is rotated.
  if (user) {
    const existing = await prisma.liveQuizParticipant.findFirst({
      where: { sessionId: session.id, userId: user.id },
      select: { id: true },
    });
    if (existing) {
      await prisma.liveQuizParticipant.update({
        where: { id: existing.id },
        data: { joinTokenHash },
      });
      return { sessionId: session.id, participantId: existing.id, joinToken, displayName };
    }
  }

  const participant = await prisma.liveQuizParticipant.create({
    data: { sessionId: session.id, userId: user?.id ?? null, displayName, joinTokenHash },
  });
  const participantCount = await prisma.liveQuizParticipant.count({ where: { sessionId: session.id } });
  publishLiveQuizEvent({ kind: "LOBBY_UPDATE", sessionId: session.id, participantCount });
  return { sessionId: session.id, participantId: participant.id, joinToken, displayName };
}

/** Resolves the participant from its join token (guests / cookie) or the logged-in user id. */
export async function resolveParticipant(sessionId: string, auth: LiveQuizParticipantAuth) {
  if (auth.joinToken) {
    const p = await prisma.liveQuizParticipant.findUnique({
      where: { sessionId_joinTokenHash: { sessionId, joinTokenHash: hashJoinToken(auth.joinToken) } },
    });
    if (p) return p;
  }
  if (auth.userId) {
    const p = await prisma.liveQuizParticipant.findFirst({ where: { sessionId, userId: auth.userId } });
    if (p) return p;
  }
  return null;
}

export type LiveQuizControlAction = "OPEN" | "CLOSE" | "NEXT" | "FINISH";

export async function advanceLiveQuiz(
  sessionId: string,
  actor: LiveQuizActor,
  action: LiveQuizControlAction
) {
  const session = await loadSessionForHost(sessionId, actor);
  const questions = parseSnapshot(session.questionsSnapshot);
  const now = new Date();

  const transition = (): { from: LiveQuizStatus[]; data: Prisma.LiveQuizSessionUpdateManyMutationInput } => {
    switch (action) {
      case "OPEN":
        return {
          from: ["LOBBY"],
          data: { status: "QUESTION_OPEN", currentIndex: 0, questionStartedAt: now },
        };
      case "CLOSE":
        return { from: ["QUESTION_OPEN"], data: { status: "QUESTION_CLOSED" } };
      case "NEXT": {
        const next = session.currentIndex + 1;
        if (next >= questions.length) {
          return { from: ["QUESTION_CLOSED"], data: { status: "FINISHED", endedAt: now } };
        }
        return {
          from: ["QUESTION_CLOSED"],
          data: { status: "QUESTION_OPEN", currentIndex: next, questionStartedAt: now },
        };
      }
      case "FINISH":
        return {
          from: ["LOBBY", "QUESTION_OPEN", "QUESTION_CLOSED"],
          data: { status: "FINISHED", endedAt: now },
        };
    }
  };

  const { from, data } = transition();
  // Conditional update = optimistic lock: two hosts double-clicking cannot skip a question.
  const res = await prisma.liveQuizSession.updateMany({
    where: { id: sessionId, status: { in: from }, currentIndex: session.currentIndex },
    data,
  });
  if (res.count === 0) {
    throw new AppError("Trạng thái phiên đã thay đổi, hãy tải lại.", 409, "LIVE_QUIZ_STATE_CONFLICT");
  }

  const updated = await prisma.liveQuizSession.findUniqueOrThrow({ where: { id: sessionId } });
  const kind =
    updated.status === "FINISHED"
      ? "SESSION_END"
      : updated.status === "QUESTION_OPEN"
        ? "QUESTION_START"
        : "QUESTION_REVEAL";
  publishLiveQuizEvent({ kind, sessionId, questionIndex: updated.currentIndex });
  return { status: updated.status, currentIndex: updated.currentIndex };
}

function gradeLiveAnswer(q: LiveQuizSnapshotQuestion, answer: AnswerValue): boolean {
  if (q.answerKey === null || q.answerKey === undefined) return false;
  const res = gradeField(
    { id: q.id, type: q.type, points: 1, options: q.options, answerKey: q.answerKey, gradingOpts: q.gradingOpts },
    answer
  );
  return res.isCorrect === true;
}

function isAnswerShapeValid(q: LiveQuizSnapshotQuestion, answer: unknown): answer is AnswerValue {
  switch (q.type) {
    case "MULTIPLE_CHOICE":
      return typeof answer === "string" && answer.length <= 100;
    case "MULTI_SELECT":
      return Array.isArray(answer) && answer.length <= 20 && answer.every((a) => typeof a === "string");
    case "TRUE_FALSE":
      return typeof answer === "boolean";
    case "TEXT":
      return typeof answer === "string" && answer.trim().length > 0 && answer.length <= 500;
    case "NUMBER":
      return (typeof answer === "number" && Number.isFinite(answer)) || (typeof answer === "string" && answer.length <= 50);
  }
}

export async function submitLiveQuizAnswer(
  sessionId: string,
  auth: LiveQuizParticipantAuth,
  input: { questionIndex: number; answer?: unknown }
) {
  const session = await prisma.liveQuizSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new AppError("Không tìm thấy phiên Live Quiz.", 404, "NOT_FOUND");
  }
  const participant = await resolveParticipant(sessionId, auth);
  if (!participant) {
    throw new AppError("Bạn chưa tham gia phiên Live Quiz này.", 403, "LIVE_QUIZ_NOT_JOINED");
  }
  if (session.status !== "QUESTION_OPEN" || !session.questionStartedAt) {
    throw new AppError("Câu hỏi chưa mở hoặc đã đóng.", 409, "LIVE_QUIZ_QUESTION_CLOSED");
  }

  const questions = parseSnapshot(session.questionsSnapshot);
  const idx = input.questionIndex;
  const isSelfPaced = session.mode === "SELF_PACED";
  if (!Number.isInteger(idx) || idx < 0 || idx >= questions.length || (!isSelfPaced && idx !== session.currentIndex)) {
    throw new AppError("Câu hỏi chưa mở hoặc đã đóng.", 409, "LIVE_QUIZ_QUESTION_CLOSED");
  }
  const question = questions[idx]!;
  if (!isAnswerShapeValid(question, input.answer)) {
    throw new AppError("Câu trả lời không hợp lệ.", 400, "VALIDATION_ERROR");
  }

  const already = await prisma.liveQuizAnswer.findUnique({
    where: { participantId_questionIndex: { participantId: participant.id, questionIndex: idx } },
    select: { id: true },
  });
  if (already) {
    throw new AppError("Bạn đã trả lời câu này rồi.", 409, "LIVE_QUIZ_ALREADY_ANSWERED");
  }

  // Server clock only: the client never reports its own response time.
  const limitMs = question.timeLimitSec * 1000;
  let startedAt = session.questionStartedAt.getTime();
  if (isSelfPaced) {
    const last = await prisma.liveQuizAnswer.findFirst({
      where: { participantId: participant.id },
      orderBy: { answeredAt: "desc" },
      select: { answeredAt: true },
    });
    startedAt = Math.max(startedAt, last?.answeredAt.getTime() ?? participant.joinedAt.getTime());
  }
  const responseMs = Math.max(0, Date.now() - startedAt);
  if (!isSelfPaced && responseMs > limitMs + LATE_GRACE_MS) {
    throw new AppError("Đã hết giờ trả lời câu này.", 409, "LIVE_QUIZ_TIME_UP");
  }

  const isCorrect = gradeLiveAnswer(question, input.answer);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.liveQuizParticipant.findUniqueOrThrow({
        where: { id: participant.id },
        select: { streak: true },
      });
      const points = computeLiveQuizPoints({
        isCorrect,
        responseMs: Math.min(responseMs, isSelfPaced ? SELF_PACED_LIMIT_CAP_MS : limitMs),
        limitMs,
        streak: fresh.streak,
      });
      await tx.liveQuizAnswer.create({
        data: {
          sessionId,
          participantId: participant.id,
          questionIndex: idx,
          answer: input.answer as Prisma.InputJsonValue,
          isCorrect,
          responseMs,
          pointsAwarded: points,
        },
      });
      const p = await tx.liveQuizParticipant.update({
        where: { id: participant.id },
        data: {
          totalScore: { increment: points },
          correctCount: { increment: isCorrect ? 1 : 0 },
          streak: isCorrect ? { increment: 1 } : 0,
        },
        select: { totalScore: true, streak: true },
      });
      return { points, ...p };
    });

    const answerCount = await prisma.liveQuizAnswer.count({ where: { sessionId, questionIndex: idx } });
    publishLiveQuizEvent({ kind: "ANSWER_COUNT", sessionId, questionIndex: idx, answerCount });

    // HOST_PACED: correctness is revealed to everybody when the question closes, so classmates
    // cannot pass the answer around while it is still open. SELF_PACED: instant feedback.
    if (isSelfPaced) {
      return { accepted: true, isCorrect, points: result.points, totalScore: result.totalScore, streak: result.streak };
    }
    return { accepted: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Bạn đã trả lời câu này rồi.", 409, "LIVE_QUIZ_ALREADY_ANSWERED");
    }
    throw error;
  }
}

function revealAnswer(q: LiveQuizSnapshotQuestion): unknown {
  return q.answerKey ?? null;
}

async function buildDistribution(sessionId: string, questionIndex: number, q: LiveQuizSnapshotQuestion) {
  const answers = await prisma.liveQuizAnswer.findMany({
    where: { sessionId, questionIndex },
    select: { answer: true, isCorrect: true },
  });
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const a of answers) {
    const v = a.answer as unknown;
    if (q.type === "MULTI_SELECT" && Array.isArray(v)) v.forEach((x) => bump(String(x)));
    else if (q.type === "TRUE_FALSE") bump(v === true ? "true" : "false");
    else if (q.type === "TEXT") bump(normalizeText(String(v)).slice(0, 80));
    else bump(String(v));
  }
  let buckets: Array<{ key: string; label: string; count: number }>;
  if (q.options && q.options.length > 0) {
    buckets = q.options.map((o) => ({ key: o.id, label: o.text, count: counts.get(o.id) ?? 0 }));
  } else if (q.type === "TRUE_FALSE") {
    buckets = [
      { key: "true", label: "TRUE", count: counts.get("true") ?? 0 },
      { key: "false", label: "FALSE", count: counts.get("false") ?? 0 },
    ];
  } else {
    buckets = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, count]) => ({ key, label: key, count }));
  }
  return {
    total: answers.length,
    correctCount: answers.filter((a) => a.isCorrect).length,
    buckets,
  };
}

async function topLeaderboard(sessionId: string, take = 5) {
  const rows = await prisma.liveQuizParticipant.findMany({
    where: { sessionId },
    orderBy: [{ totalScore: "desc" }, { joinedAt: "asc" }],
    take,
    select: { id: true, displayName: true, totalScore: true, correctCount: true },
  });
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

function sessionHeader(session: {
  id: string;
  title: string;
  pinCode: string;
  mode: LiveQuizMode;
  status: LiveQuizStatus;
  currentIndex: number;
  questionStartedAt: Date | null;
  questionLimitSec: number;
  isExitTicket: boolean;
  classId: string | null;
}, total: number) {
  return {
    id: session.id,
    title: session.title,
    pinCode: session.pinCode,
    mode: session.mode,
    status: session.status,
    currentIndex: session.currentIndex,
    questionCount: total,
    questionStartedAt: session.questionStartedAt?.toISOString() ?? null,
    questionLimitSec: session.questionLimitSec,
    isExitTicket: session.isExitTicket,
    classId: session.classId,
    serverNow: new Date().toISOString(),
  };
}

/** Projector / control view. The answer key is only included once the question is closed. */
export async function getLiveQuizHostView(sessionId: string, actor: LiveQuizActor) {
  const session = await loadSessionForHost(sessionId, actor);
  const questions = parseSnapshot(session.questionsSnapshot);
  const q = questions[session.currentIndex] ?? null;
  const revealed = session.status === "QUESTION_CLOSED" || session.status === "FINISHED";

  const [participantCount, answerCount, participants] = await Promise.all([
    prisma.liveQuizParticipant.count({ where: { sessionId } }),
    q ? prisma.liveQuizAnswer.count({ where: { sessionId, questionIndex: session.currentIndex } }) : 0,
    session.status === "LOBBY"
      ? prisma.liveQuizParticipant.findMany({
          where: { sessionId },
          orderBy: { joinedAt: "asc" },
          take: 200,
          select: { id: true, displayName: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    role: "HOST" as const,
    session: sessionHeader(session, questions.length),
    participantCount,
    answerCount,
    participants,
    question: q && session.status !== "LOBBY" ? sanitizeLiveQuestionForPlayer(q) : null,
    reveal:
      q && revealed && session.status !== "LOBBY"
        ? { correctAnswer: revealAnswer(q), distribution: await buildDistribution(sessionId, session.currentIndex, q) }
        : null,
    leaderboard: revealed ? await topLeaderboard(sessionId) : [],
  };
}

/** Player view: never contains the answer key while the question is open. */
export async function getLiveQuizPlayerView(sessionId: string, auth: LiveQuizParticipantAuth) {
  const session = await prisma.liveQuizSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new AppError("Không tìm thấy phiên Live Quiz.", 404, "NOT_FOUND");
  }
  const participant = await resolveParticipant(sessionId, auth);
  if (!participant) {
    throw new AppError("Bạn chưa tham gia phiên Live Quiz này.", 403, "LIVE_QUIZ_NOT_JOINED");
  }
  const questions = parseSnapshot(session.questionsSnapshot);
  const isSelfPaced = session.mode === "SELF_PACED";
  const revealed = session.status === "QUESTION_CLOSED" || session.status === "FINISHED";
  const q = questions[session.currentIndex] ?? null;

  const myAnswers = await prisma.liveQuizAnswer.findMany({
    where: { participantId: participant.id },
    select: { questionIndex: true, isCorrect: true, pointsAwarded: true },
  });
  const answeredIdx = new Set(myAnswers.map((a) => a.questionIndex));
  const mine = myAnswers.find((a) => a.questionIndex === session.currentIndex) ?? null;

  const higher = await prisma.liveQuizParticipant.count({
    where: { sessionId, totalScore: { gt: participant.totalScore } },
  });

  const showQuestion = session.status === "QUESTION_OPEN" || session.status === "QUESTION_CLOSED";
  return {
    role: "PLAYER" as const,
    session: sessionHeader(session, questions.length),
    me: {
      participantId: participant.id,
      displayName: participant.displayName,
      totalScore: participant.totalScore,
      correctCount: participant.correctCount,
      streak: participant.streak,
      rank: higher + 1,
    },
    question: showQuestion && q && !isSelfPaced ? sanitizeLiveQuestionForPlayer(q) : null,
    selfPacedQuestions:
      isSelfPaced && session.status === "QUESTION_OPEN" ? questions.map(sanitizeLiveQuestionForPlayer) : null,
    answeredIndexes: Array.from(answeredIdx).sort((a, b) => a - b),
    myAnswer: mine
      ? revealed || isSelfPaced
        ? { answered: true, isCorrect: mine.isCorrect, points: mine.pointsAwarded }
        : { answered: true }
      : null,
    reveal: q && revealed && !isSelfPaced ? { correctAnswer: revealAnswer(q) } : null,
    leaderboard: revealed ? await topLeaderboard(sessionId) : [],
  };
}

/** Pushes each enrolled participant's correct ratio into a new offline gradebook column (Phase 21). */
export async function exportLiveQuizToOfflineGrade(
  sessionId: string,
  actor: LiveQuizActor,
  input: { columnTitle?: string | null; maxScore?: number }
) {
  const session = await loadSessionForHost(sessionId, actor);
  if (!session.classId) {
    throw new AppError("Chỉ phiên gắn với lớp mới chuyển được điểm sang Sổ điểm.", 400, "LIVE_QUIZ_NO_CLASS");
  }
  const total = parseSnapshot(session.questionsSnapshot).length;
  const maxScore = input.maxScore && input.maxScore > 0 ? Math.min(input.maxScore, 1000) : 10;
  const participants = await prisma.liveQuizParticipant.findMany({
    where: { sessionId, userId: { not: null } },
    select: { userId: true, correctCount: true },
  });

  const column = await createOfflineGradeColumn(session.classId, actor.id, {
    title: (input.columnTitle?.trim() || `Live Quiz: ${session.title}`).slice(0, 120),
    maxScore,
    note: `Live Quiz PIN ${session.pinCode}`,
  });

  const activeIds = new Set(
    (
      await prisma.enrollment.findMany({
        where: { classId: session.classId, status: "ACTIVE", student: { deletedAt: null } },
        select: { studentId: true },
      })
    ).map((e) => e.studentId)
  );
  const entries = participants
    .filter((p): p is { userId: string; correctCount: number } => Boolean(p.userId && activeIds.has(p.userId)))
    .map((p) => ({ studentId: p.userId, score: liveQuizRatioToScore(p.correctCount, total, maxScore) }));

  if (entries.length > 0) {
    await saveOfflineGradeEntries(session.classId, column.id, entries);
  }
  return { columnId: column.id, exportedCount: entries.length };
}
