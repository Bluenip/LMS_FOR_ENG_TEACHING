import type { Prisma, Role, WorksheetSubject } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  exportAnkiCsv,
  parseAikenText,
  parseAnkiCsv,
  parseMoodleXml,
  parseQuizizzCsv,
  type ImportResult,
} from "@/lib/import/standard-exam-parsers";
import { logAudit } from "./auditService";

export type StandardFormat = "AIKEN" | "MOODLE_XML" | "QUIZIZZ_CSV";
const MAX_INPUT = 2_000_000;

export function parseStandardContent(format: StandardFormat, content: string): ImportResult {
  if (content.length > MAX_INPUT) throw new AppError("Tệp quá lớn (tối đa 2MB văn bản).", 400, "IMPORT_TOO_LARGE");
  try {
    if (format === "AIKEN") return parseAikenText(content);
    if (format === "MOODLE_XML") return parseMoodleXml(content);
    return parseQuizizzCsv(content);
  } catch (e) {
    if (e instanceof Error && e.message === "XML_DTD_NOT_ALLOWED") {
      throw new AppError("Tệp XML chứa DOCTYPE/ENTITY không được phép.", 400, "IMPORT_XML_DTD");
    }
    throw new AppError("Không đọc được tệp. Hãy kiểm tra đúng định dạng.", 400, "IMPORT_PARSE_ERROR");
  }
}

/**
 * Imports Aiken / Moodle XML / Quizizz CSV questions either at the end of a worksheet the actor owns
 * or into their question bank.
 */
export async function importStandardQuestions(
  actor: { id: string; role: Role },
  input: { format: StandardFormat; content: string; target: "WORKSHEET" | "BANK"; worksheetId?: string | null; subject?: WorksheetSubject | null; dryRun?: boolean }
) {
  const { questions, warnings } = parseStandardContent(input.format, input.content);
  if (input.dryRun) return { imported: 0, questions, warnings };
  if (questions.length === 0) throw new AppError("Không tìm thấy câu hỏi hợp lệ trong tệp.", 400, "IMPORT_EMPTY");

  if (input.target === "WORKSHEET") {
    const ws = await prisma.worksheet.findUnique({ where: { id: input.worksheetId ?? "" }, select: { id: true, ownerId: true, deletedAt: true } });
    if (!ws || ws.deletedAt) throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
    if (actor.role !== "ADMIN" && ws.ownerId !== actor.id) throw new AppError("Bạn không có quyền chỉnh sửa phiếu bài tập này.", 403, "FORBIDDEN");
    const agg = await prisma.field.aggregate({ where: { worksheetId: ws.id }, _max: { order: true }, _count: true });
    const start = (agg._max.order ?? 0) + 1;
    await prisma.field.createMany({
      data: questions.map((q, i) => ({
        worksheetId: ws.id,
        placement: "ANSWER_SHEET" as const,
        type: q.type,
        label: String(agg._count + i + 1),
        prompt: q.prompt,
        explanation: q.explanation,
        order: start + i,
        points: q.points,
        options: (q.options ?? undefined) as Prisma.InputJsonValue | undefined,
        answerKey: q.answerKey as Prisma.InputJsonValue,
      })),
    });
  } else {
    await prisma.questionBankItem.createMany({
      data: questions.map((q) => ({
        ownerId: actor.id,
        subject: input.subject ?? "GENERAL",
        type: q.type,
        prompt: q.prompt,
        options: (q.options ?? undefined) as Prisma.InputJsonValue | undefined,
        answerKey: q.answerKey as Prisma.InputJsonValue,
        explanation: q.explanation,
        tags: [input.format.toLowerCase()],
      })),
    });
  }
  await logAudit({
    actorId: actor.id,
    action: "STANDARD_IMPORT",
    targetType: input.target === "WORKSHEET" ? "WORKSHEET" : "SYSTEM",
    targetId: input.worksheetId ?? null,
    summary: `Nhập ${questions.length} câu từ ${input.format}`,
    summaryEn: `Imported ${questions.length} questions from ${input.format}`,
  });
  return { imported: questions.length, questions: [], warnings };
}

async function loadOwnDeck(deckId: string, actor: { id: string; role: Role }) {
  const deck = await prisma.flashcardDeck.findUnique({ where: { id: deckId }, select: { id: true, ownerId: true, title: true } });
  if (!deck) throw new AppError("Không tìm thấy bộ thẻ.", 404, "NOT_FOUND");
  if (actor.role !== "ADMIN" && deck.ownerId !== actor.id) throw new AppError("Bạn không có quyền chỉnh sửa bộ thẻ này.", 403, "FORBIDDEN");
  return deck;
}

export async function importAnkiIntoDeck(deckId: string, actor: { id: string; role: Role }, content: string) {
  await loadOwnDeck(deckId, actor);
  if (content.length > MAX_INPUT) throw new AppError("Tệp quá lớn (tối đa 2MB văn bản).", 400, "IMPORT_TOO_LARGE");
  const { cards, warnings } = parseAnkiCsv(content);
  if (cards.length === 0) throw new AppError("Không tìm thấy thẻ hợp lệ trong tệp.", 400, "IMPORT_EMPTY");
  const max = await prisma.flashcard.aggregate({ where: { deckId }, _max: { order: true } });
  const start = (max._max.order ?? -1) + 1;
  await prisma.flashcard.createMany({ data: cards.map((c, i) => ({ deckId, front: c.front, back: c.back, order: start + i })) });
  return { imported: cards.length, warnings };
}

/** Anki export is allowed to anyone who can see the deck (owner, admin, or a student of its class). */
export async function exportDeckAsAnki(deckId: string, actor: { id: string; role: Role }) {
  const deck = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    select: { ownerId: true, classId: true, title: true, cards: { orderBy: { order: "asc" }, select: { front: true, back: true } } },
  });
  if (!deck) throw new AppError("Không tìm thấy bộ thẻ.", 404, "NOT_FOUND");
  let allowed = actor.role === "ADMIN" || deck.ownerId === actor.id;
  if (!allowed && deck.classId) {
    const enr = await prisma.enrollment.findUnique({ where: { classId_studentId: { classId: deck.classId, studentId: actor.id } }, select: { status: true } });
    const cls = await prisma.class.findUnique({ where: { id: deck.classId }, select: { teacherId: true, classTeachers: { where: { userId: actor.id }, select: { id: true } } } });
    allowed = enr?.status === "ACTIVE" || cls?.teacherId === actor.id || Boolean(cls?.classTeachers.length);
  }
  if (!allowed) throw new AppError("Không tìm thấy bộ thẻ.", 404, "NOT_FOUND");
  const safe = deck.title.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9 _-]/g, "").trim() || "deck";
  return { text: exportAnkiCsv(deck.cards), filename: `${safe}.txt` };
}
