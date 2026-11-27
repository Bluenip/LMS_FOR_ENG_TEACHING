import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { computeNextSrsState, type SrsQuality } from "@/lib/srs";
import { hasMinClassRole } from "@/lib/class-roles";
import { resolveUserClassRole } from "./classRoleHelper";

export interface FlashcardCardInput {
  front: string;
  back: string;
  phonetic?: string | null;
  example?: string | null;
}

async function assertDeckAccess(
  deckId: string,
  userId: string,
  userRole: Role
) {
  const deck = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    include: {
      class: { select: { id: true, name: true, teacherId: true, deletedAt: true } },
    },
  });
  if (!deck) {
    throw new AppError("Không tìm thấy bộ thẻ.", 404, "NOT_FOUND");
  }

  if (userRole === "ADMIN" || deck.ownerId === userId) {
    return deck;
  }

  if (deck.classId && deck.class && !deck.class.deletedAt) {
    if (userRole === "TEACHER") {
      const cr = await resolveUserClassRole(
        deck.class.id,
        userId,
        userRole,
        deck.class.teacherId
      );
      if (hasMinClassRole(cr, "ASSISTANT")) return deck;
    } else if (userRole === "STUDENT") {
      const enr = await prisma.enrollment.findUnique({
        where: { classId_studentId: { classId: deck.classId, studentId: userId } },
        select: { status: true },
      });
      if (enr?.status === "ACTIVE") return deck;
    }
  }

  throw new AppError("Bạn không có quyền truy cập bộ thẻ này.", 403, "FORBIDDEN");
}

export async function listFlashcardDecksForUser(userId: string, role: Role) {
  const now = new Date();
  let where;

  if (role === "STUDENT") {
    const activeClasses = await prisma.enrollment.findMany({
      where: { studentId: userId, status: "ACTIVE", class: { deletedAt: null } },
      select: { classId: true },
    });
    const classIds = activeClasses.map((e) => e.classId);
    where = {
      OR: [
        { ownerId: userId },
        ...(classIds.length > 0 ? [{ classId: { in: classIds } }] : []),
      ],
    };
  } else if (role === "ADMIN") {
    where = {};
  } else {
    where = { ownerId: userId };
  }

  const decks = await prisma.flashcardDeck.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { id: true, name: true } },
      class: { select: { id: true, name: true } },
      cards: {
        select: {
          id: true,
          reviews: {
            where: { studentId: userId },
            select: { nextReviewAt: true, repetitions: true },
          },
        },
      },
    },
  });

  return decks.map((d) => {
    let dueCount = 0;
    let masteredCount = 0;
    for (const c of d.cards) {
      const rev = c.reviews[0];
      if (!rev || rev.nextReviewAt <= now) dueCount++;
      if (rev && rev.repetitions >= 3) masteredCount++;
    }
    return {
      id: d.id,
      ownerId: d.ownerId,
      ownerName: d.owner?.name ?? "Pivora",
      classId: d.classId,
      className: d.class?.name ?? null,
      title: d.title,
      description: d.description,
      cardCount: d.cards.length,
      dueCount,
      masteredCount,
      updatedAt: d.updatedAt.toISOString(),
    };
  });
}

export async function createFlashcardDeck(
  userId: string,
  role: Role,
  input: {
    title: string;
    description?: string | null;
    classId?: string | null;
    cards: FlashcardCardInput[];
  }
) {
  if (input.classId) {
    if (role !== "TEACHER" && role !== "ADMIN") {
      throw new AppError("Chỉ giáo viên mới tạo được bộ thẻ gắn cho cả lớp.", 403, "FORBIDDEN");
    }
    const cls = await prisma.class.findUnique({
      where: { id: input.classId },
      select: { id: true, teacherId: true, deletedAt: true },
    });
    if (!cls || cls.deletedAt) {
      throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
    }
    if (role !== "ADMIN") {
      const cr = await resolveUserClassRole(cls.id, userId, role, cls.teacherId);
      if (!hasMinClassRole(cr, "CO_TEACHER")) {
        throw new AppError("Bạn không có quyền quản lý lớp học này.", 403, "FORBIDDEN");
      }
    }
  }

  return prisma.flashcardDeck.create({
    data: {
      ownerId: userId,
      classId: input.classId ?? null,
      title: input.title,
      description: input.description ?? null,
      cards: {
        create: input.cards.map((c, idx) => ({
          front: c.front.trim(),
          back: c.back.trim(),
          phonetic: c.phonetic?.trim() || null,
          example: c.example?.trim() || null,
          order: idx,
        })),
      },
    },
    include: { cards: { orderBy: { order: "asc" } } },
  });
}

export async function extractFlashcardsFromWorksheet(
  teacherId: string,
  isAdmin: boolean,
  input: { worksheetId: string; classId?: string | null; title?: string }
) {
  const ws = await prisma.worksheet.findUnique({
    where: { id: input.worksheetId },
    include: {
      fields: { orderBy: { order: "asc" } },
    },
  });
  if (!ws || ws.deletedAt) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }
  if (!isAdmin && ws.ownerId !== teacherId && !ws.isShared) {
    throw new AppError("Bạn không có quyền xem phiếu bài tập này.", 403, "FORBIDDEN");
  }

  const cards: FlashcardCardInput[] = [];
  for (const f of ws.fields) {
    if (!f.prompt?.trim()) continue;
    const ak = f.answerKey as Record<string, unknown> | null;
    let back = "";
    if (f.type === "TEXT" || f.type === "DICTATION") {
      const acc = Array.isArray(ak?.accepted) ? ak.accepted : [];
      back = acc.length > 0 ? String(acc[0]) : "";
    } else if (f.type === "MULTIPLE_CHOICE" && Array.isArray(f.options)) {
      const correctId = ak?.correct ? String(ak.correct) : "";
      const opt = (f.options as Array<{ id?: string; text?: string }>).find(
        (o) => o.id === correctId
      );
      back = opt?.text?.trim() || correctId;
    } else if (f.type === "NUMBER" && ak?.value !== undefined) {
      back = String(ak.value);
    }

    if (back) {
      cards.push({
        front: f.prompt.trim().slice(0, 500),
        back: back.slice(0, 1000),
        example: f.explanation?.trim()?.slice(0, 600) || null,
      });
    }
  }

  if (cards.length === 0) {
    throw new AppError(
      "Không trích xuất được thẻ nào từ phiếu bài tập này.",
      400,
      "VALIDATION_ERROR"
    );
  }

  return createFlashcardDeck(teacherId, isAdmin ? "ADMIN" : "TEACHER", {
    title: input.title?.trim() || `Flashcard — ${ws.title}`,
    classId: input.classId ?? null,
    cards,
  });
}

export async function deleteFlashcardDeck(deckId: string, userId: string, isAdmin: boolean) {
  const deck = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    select: { id: true, ownerId: true },
  });
  if (!deck) {
    throw new AppError("Không tìm thấy bộ thẻ.", 404, "NOT_FOUND");
  }
  if (!isAdmin && deck.ownerId !== userId) {
    throw new AppError("Bạn không có quyền truy cập bộ thẻ này.", 403, "FORBIDDEN");
  }
  await prisma.flashcardDeck.delete({ where: { id: deckId } });
  return { ok: true };
}

export async function getDeckReviewQueue(deckId: string, userId: string, role: Role) {
  const deck = await assertDeckAccess(deckId, userId, role);
  const now = new Date();

  const cards = await prisma.flashcard.findMany({
    where: { deckId },
    orderBy: { order: "asc" },
    include: {
      reviews: {
        where: { studentId: userId },
      },
    },
  });

  const mapped = cards.map((c) => {
    const rev = c.reviews[0] ?? null;
    const isDue = !rev || rev.nextReviewAt <= now;
    return {
      id: c.id,
      front: c.front,
      back: c.back,
      phonetic: c.phonetic,
      example: c.example,
      audioKey: c.audioKey,
      isDue,
      srs: rev
        ? {
            easeFactor: rev.easeFactor,
            intervalDays: rev.intervalDays,
            repetitions: rev.repetitions,
            nextReviewAt: rev.nextReviewAt.toISOString(),
            lastReviewedAt: rev.lastReviewedAt?.toISOString() ?? null,
          }
        : null,
    };
  });

  return {
    deck: {
      id: deck.id,
      title: deck.title,
      description: deck.description,
      classId: deck.classId,
      className: deck.class?.name ?? null,
    },
    cards: mapped,
    dueCards: mapped.filter((c) => c.isDue),
  };
}

export async function submitFlashcardReview(
  deckId: string,
  flashcardId: string,
  userId: string,
  role: Role,
  quality: SrsQuality
) {
  await assertDeckAccess(deckId, userId, role);

  const card = await prisma.flashcard.findFirst({
    where: { id: flashcardId, deckId },
    select: { id: true },
  });
  if (!card) {
    throw new AppError("Không tìm thấy thẻ trong bộ thẻ này.", 404, "NOT_FOUND");
  }

  const prev = await prisma.flashcardReview.findUnique({
    where: { flashcardId_studentId: { flashcardId, studentId: userId } },
  });

  const now = new Date();
  const next = computeNextSrsState(
    prev
      ? {
          easeFactor: prev.easeFactor,
          intervalDays: prev.intervalDays,
          repetitions: prev.repetitions,
        }
      : null,
    quality,
    now
  );

  const saved = await prisma.flashcardReview.upsert({
    where: { flashcardId_studentId: { flashcardId, studentId: userId } },
    create: {
      flashcardId,
      studentId: userId,
      easeFactor: next.easeFactor,
      intervalDays: next.intervalDays,
      repetitions: next.repetitions,
      nextReviewAt: next.nextReviewAt,
      lastReviewedAt: now,
    },
    update: {
      easeFactor: next.easeFactor,
      intervalDays: next.intervalDays,
      repetitions: next.repetitions,
      nextReviewAt: next.nextReviewAt,
      lastReviewedAt: now,
    },
  });

  return {
    flashcardId,
    easeFactor: saved.easeFactor,
    intervalDays: saved.intervalDays,
    repetitions: saved.repetitions,
    nextReviewAt: saved.nextReviewAt.toISOString(),
  };
}
