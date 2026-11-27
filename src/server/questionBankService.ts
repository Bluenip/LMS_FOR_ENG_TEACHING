import crypto from "node:crypto";
import path from "node:path";
import { Prisma, type FieldType, type SkillTag, type WorksheetSubject } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getStorageProvider } from "@/lib/storage";
import {
  countAvailableForMatrixRow,
  pickQuestionsByMatrix,
  type MatrixRowSpec,
  type MatrixShortage,
} from "@/lib/exam/matrix-picker";

export class MatrixInsufficientError extends AppError {
  public readonly shortages: MatrixShortage[];

  constructor(shortages: MatrixShortage[]) {
    super(
      "Kho câu hỏi không đủ câu cho ma trận đề.",
      400,
      "MATRIX_INSUFFICIENT_QUESTIONS"
    );
    this.shortages = shortages;
  }
}

export interface ListQuestionBankFilters {
  scope?: "mine" | "shared" | "all";
  subject?: WorksheetSubject;
  type?: FieldType;
  topicTag?: string;
  skillTag?: SkillTag;
  level?: string;
  difficultyMin?: number;
  difficultyMax?: number;
  tag?: string;
  q?: string;
}

function normalizeTags(tags?: string[]): string[] {
  if (!tags || tags.length === 0) return [];
  return Array.from(
    new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))
  ).slice(0, 20);
}

/**
 * Builds strict anti-IDOR Prisma WHERE clause: a non-admin user can ONLY see their own items
 * or items explicitly shared (`isShared: true`).
 */
function buildAccessiblePoolWhere(
  userId: string,
  isAdmin: boolean,
  includeShared = true
): Prisma.QuestionBankItemWhereInput {
  if (isAdmin) {
    return includeShared ? { deletedAt: null } : { deletedAt: null, ownerId: userId };
  }
  if (!includeShared) {
    return { deletedAt: null, ownerId: userId };
  }
  return {
    deletedAt: null,
    OR: [{ ownerId: userId }, { isShared: true }],
  };
}

export async function listQuestionBankItems(
  userId: string,
  isAdmin: boolean,
  filters: ListQuestionBankFilters = {}
) {
  const scope = filters.scope ?? "all";
  let scopeWhere: Prisma.QuestionBankItemWhereInput;
  if (scope === "mine") {
    scopeWhere = { deletedAt: null, ownerId: userId };
  } else if (scope === "shared") {
    scopeWhere = isAdmin
      ? { deletedAt: null, isShared: true }
      : { deletedAt: null, isShared: true };
  } else {
    scopeWhere = buildAccessiblePoolWhere(userId, isAdmin, true);
  }

  const difficultyFilter: Prisma.IntFilter | undefined =
    filters.difficultyMin !== undefined || filters.difficultyMax !== undefined
      ? {
          ...(filters.difficultyMin !== undefined ? { gte: filters.difficultyMin } : {}),
          ...(filters.difficultyMax !== undefined ? { lte: filters.difficultyMax } : {}),
        }
      : undefined;

  const where: Prisma.QuestionBankItemWhereInput = {
    AND: [
      scopeWhere,
      ...(filters.subject ? [{ subject: filters.subject }] : []),
      ...(filters.type ? [{ type: filters.type }] : []),
      ...(filters.skillTag ? [{ skillTag: filters.skillTag }] : []),
      ...(filters.topicTag?.trim()
        ? [{ topicTag: { contains: filters.topicTag.trim(), mode: "insensitive" as const } }]
        : []),
      ...(filters.level?.trim()
        ? [{ level: { contains: filters.level.trim(), mode: "insensitive" as const } }]
        : []),
      ...(difficultyFilter ? [{ difficulty: difficultyFilter }] : []),
      ...(filters.tag?.trim() ? [{ tags: { has: filters.tag.trim() } }] : []),
      ...(filters.q?.trim()
        ? [
            {
              OR: [
                { prompt: { contains: filters.q.trim(), mode: "insensitive" as const } },
                { topicTag: { contains: filters.q.trim(), mode: "insensitive" as const } },
                { explanation: { contains: filters.q.trim(), mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };

  const [items, facetRows] = await Promise.all([
    prisma.questionBankItem.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 300,
      include: {
        owner: { select: { id: true, name: true } },
      },
    }),
    prisma.questionBankItem.findMany({
      where: buildAccessiblePoolWhere(userId, isAdmin, true),
      select: { topicTag: true, level: true, tags: true },
      take: 500,
    }),
  ]);

  const topicSet = new Set<string>();
  const levelSet = new Set<string>();
  const tagSet = new Set<string>();
  for (const r of facetRows) {
    if (r.topicTag) topicSet.add(r.topicTag);
    if (r.level) levelSet.add(r.level);
    for (const t of r.tags) tagSet.add(t);
  }

  return {
    items: items.map((it) => ({
      ...it,
      createdAt: it.createdAt.toISOString(),
      updatedAt: it.updatedAt.toISOString(),
    })),
    facets: {
      topicTags: Array.from(topicSet).sort((a, b) => a.localeCompare(b, "vi")),
      levels: Array.from(levelSet).sort((a, b) => a.localeCompare(b, "vi")),
      tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b, "vi")),
    },
  };
}

export async function createQuestionBankItem(
  ownerId: string,
  input: {
    subject?: WorksheetSubject;
    type: FieldType;
    prompt: string;
    options?: unknown;
    answerKey: Record<string, unknown>;
    explanation?: string | null;
    rubric?: unknown;
    skillTag?: SkillTag | null;
    topicTag?: string | null;
    level?: string | null;
    difficulty?: number;
    tags?: string[];
    audioKey?: string | null;
    imageKey?: string | null;
    isShared?: boolean;
  }
) {
  const item = await prisma.questionBankItem.create({
    data: {
      ownerId,
      subject: input.subject ?? "GENERAL",
      type: input.type,
      prompt: input.prompt,
      options:
        input.options !== undefined && input.options !== null
          ? (input.options as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      answerKey: input.answerKey as Prisma.InputJsonValue,
      explanation: input.explanation ?? null,
      rubric:
        input.rubric !== undefined && input.rubric !== null
          ? (input.rubric as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      skillTag: input.skillTag ?? null,
      topicTag: input.topicTag?.trim() || null,
      level: input.level?.trim() || null,
      difficulty: input.difficulty ?? 3,
      tags: normalizeTags(input.tags),
      audioKey: input.audioKey ?? null,
      imageKey: input.imageKey ?? null,
      isShared: Boolean(input.isShared),
    },
    include: { owner: { select: { id: true, name: true } } },
  });

  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function updateQuestionBankItem(
  id: string,
  userId: string,
  isAdmin: boolean,
  input: Partial<{
    subject: WorksheetSubject;
    type: FieldType;
    prompt: string;
    options: unknown;
    answerKey: Record<string, unknown>;
    explanation: string | null;
    rubric: unknown;
    skillTag: SkillTag | null;
    topicTag: string | null;
    level: string | null;
    difficulty: number;
    tags: string[];
    audioKey: string | null;
    imageKey: string | null;
    isShared: boolean;
  }>
) {
  const existing = await prisma.questionBankItem.findUnique({
    where: { id },
    select: { id: true, ownerId: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) {
    throw new AppError("Không tìm thấy câu hỏi trong ngân hàng.", 404, "NOT_FOUND");
  }
  if (!isAdmin && existing.ownerId !== userId) {
    throw new AppError("Bạn không có quyền chỉnh sửa câu hỏi này.", 403, "FORBIDDEN");
  }

  const updated = await prisma.questionBankItem.update({
    where: { id: existing.id },
    data: {
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      ...(input.options !== undefined
        ? {
            options:
              input.options !== null
                ? (input.options as Prisma.InputJsonValue)
                : Prisma.JsonNull,
          }
        : {}),
      ...(input.answerKey !== undefined
        ? { answerKey: input.answerKey as Prisma.InputJsonValue }
        : {}),
      ...(input.explanation !== undefined ? { explanation: input.explanation } : {}),
      ...(input.rubric !== undefined
        ? {
            rubric:
              input.rubric !== null
                ? (input.rubric as Prisma.InputJsonValue)
                : Prisma.JsonNull,
          }
        : {}),
      ...(input.skillTag !== undefined ? { skillTag: input.skillTag } : {}),
      ...(input.topicTag !== undefined ? { topicTag: input.topicTag?.trim() || null } : {}),
      ...(input.level !== undefined ? { level: input.level?.trim() || null } : {}),
      ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
      ...(input.tags !== undefined ? { tags: normalizeTags(input.tags) } : {}),
      ...(input.audioKey !== undefined ? { audioKey: input.audioKey } : {}),
      ...(input.imageKey !== undefined ? { imageKey: input.imageKey } : {}),
      ...(input.isShared !== undefined ? { isShared: input.isShared } : {}),
    },
    include: { owner: { select: { id: true, name: true } } },
  });

  return {
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function deleteQuestionBankItem(id: string, userId: string, isAdmin: boolean) {
  const existing = await prisma.questionBankItem.findUnique({
    where: { id },
    select: { id: true, ownerId: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) {
    throw new AppError("Không tìm thấy câu hỏi trong ngân hàng.", 404, "NOT_FOUND");
  }
  if (!isAdmin && existing.ownerId !== userId) {
    throw new AppError("Bạn không có quyền xoá câu hỏi này.", 403, "FORBIDDEN");
  }
  await prisma.questionBankItem.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
  });
  return { ok: true };
}

/**
 * Promotes an existing Worksheet Field into the Question Bank (with optional metadata overrides).
 */
export async function saveFieldToQuestionBank(
  fieldId: string,
  teacherId: string,
  isAdmin: boolean,
  overrides?: {
    difficulty?: number;
    level?: string | null;
    topicTag?: string | null;
    tags?: string[];
    isShared?: boolean;
  }
) {
  const field = await prisma.field.findUnique({
    where: { id: fieldId },
    include: {
      worksheet: {
        select: { id: true, ownerId: true, subject: true, isShared: true, deletedAt: true },
      },
      audio: { select: { fileKey: true } },
    },
  });
  if (!field || field.worksheet.deletedAt) {
    throw new AppError("Không tìm thấy câu hỏi nguồn.", 404, "NOT_FOUND");
  }
  const canReadSource =
    isAdmin || field.worksheet.ownerId === teacherId || field.worksheet.isShared;
  if (!canReadSource) {
    throw new AppError("Bạn không có quyền truy cập chức năng này.", 403, "FORBIDDEN");
  }

  const item = await prisma.questionBankItem.create({
    data: {
      ownerId: teacherId,
      subject: field.worksheet.subject,
      type: field.type,
      prompt: field.prompt?.trim() || `Câu ${field.label}`,
      options:
        field.options !== null
          ? (field.options as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      answerKey: field.answerKey as Prisma.InputJsonValue,
      explanation: field.explanation ?? null,
      rubric:
        field.rubric !== null
          ? (field.rubric as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      skillTag: field.skillTag ?? null,
      topicTag: overrides?.topicTag?.trim() || field.topicTag || null,
      level: overrides?.level?.trim() || null,
      difficulty: overrides?.difficulty ?? 3,
      tags: normalizeTags(overrides?.tags),
      imageKey: field.imageKey ?? null,
      audioKey: field.audio?.fileKey ?? null,
      isShared: Boolean(overrides?.isShared),
    },
    include: { owner: { select: { id: true, name: true } } },
  });

  if (isAdmin || field.worksheet.ownerId === teacherId) {
    await prisma.field.update({
      where: { id: field.id },
      data: { bankItemId: item.id },
    });
  }

  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function previewMatrixAvailability(
  teacherId: string,
  isAdmin: boolean,
  rows: MatrixRowSpec[],
  includeShared = true
) {
  const pool = await prisma.questionBankItem.findMany({
    where: buildAccessiblePoolWhere(teacherId, isAdmin, includeShared),
    select: {
      id: true,
      subject: true,
      type: true,
      topicTag: true,
      skillTag: true,
      level: true,
      difficulty: true,
      tags: true,
    },
  });

  const rowCounts = rows.map((row) => countAvailableForMatrixRow(pool, row));
  const result = pickQuestionsByMatrix(pool, rows);

  return {
    canGenerate: result.ok,
    rowCounts,
    shortages: result.ok ? [] : result.shortages,
    totalRequested: rows.reduce((s, r) => s + r.count, 0),
  };
}

function guessMimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".m4a":
      return "audio/mp4";
    default:
      return "application/octet-stream";
  }
}

/**
 * Builds a brand-new Worksheet by drawing non-overlapping questions matching each matrix row.
 * Copies `topicTag`, `bankItemId`, and clones referenced image/audio blobs into the new worksheet.
 */
export async function generateWorksheetFromMatrix(
  teacherId: string,
  isAdmin: boolean,
  input: {
    title: string;
    subject: WorksheetSubject;
    instructions?: string | null;
    includeShared?: boolean;
    rows: MatrixRowSpec[];
  }
) {
  const pool = await prisma.questionBankItem.findMany({
    where: buildAccessiblePoolWhere(teacherId, isAdmin, input.includeShared ?? true),
    orderBy: { createdAt: "asc" },
  });

  const pickResult = pickQuestionsByMatrix(pool, input.rows);
  if (!pickResult.ok) {
    throw new MatrixInsufficientError(pickResult.shortages);
  }

  const ws = await prisma.worksheet.create({
    data: {
      ownerId: teacherId,
      title: input.title,
      subject: input.subject,
      instructions: input.instructions ?? null,
      pageCount: 0,
    },
  });

  const storage = getStorageProvider();
  const audioIdBySrcKey = new Map<string, string>();
  let audioOrder = 0;

  const fieldPayloads: Prisma.FieldCreateManyInput[] = [];
  for (let i = 0; i < pickResult.picked.length; i++) {
    const entry = pickResult.picked[i]!;
    const item = entry.item;

    let copiedImageKey: string | null = null;
    if (item.imageKey) {
      try {
        const fetched = await storage.get(item.imageKey);
        if (fetched) {
          const ext = path.extname(item.imageKey) || ".png";
          const newKey = `worksheets/${ws.id}/images/${crypto.randomUUID()}${ext}`;
          await storage.put(newKey, fetched.buffer, fetched.contentType || guessMimeFromExt(ext));
          copiedImageKey = newKey;
        }
      } catch {
        copiedImageKey = null;
      }
    }

    let linkedAudioId: string | null = null;
    if (item.audioKey) {
      if (audioIdBySrcKey.has(item.audioKey)) {
        linkedAudioId = audioIdBySrcKey.get(item.audioKey)!;
      } else {
        try {
          const fetched = await storage.get(item.audioKey);
          if (fetched) {
            const ext = path.extname(item.audioKey) || ".mp3";
            const mime = fetched.contentType || guessMimeFromExt(ext);
            const newAudioKey = `worksheets/${ws.id}/audio/${crypto.randomUUID()}${ext}`;
            await storage.put(newAudioKey, fetched.buffer, mime);
            const createdAudio = await prisma.worksheetAudio.create({
              data: {
                worksheetId: ws.id,
                title: `Audio ${audioOrder + 1}`,
                fileKey: newAudioKey,
                mimeType: mime,
                order: audioOrder++,
              },
            });
            linkedAudioId = createdAudio.id;
            audioIdBySrcKey.set(item.audioKey, createdAudio.id);
          }
        } catch {
          linkedAudioId = null;
        }
      }
    }

    fieldPayloads.push({
      worksheetId: ws.id,
      placement: "ANSWER_SHEET",
      type: item.type,
      label: String(i + 1),
      prompt: item.prompt,
      explanation: item.explanation,
      skillTag: item.skillTag,
      topicTag: item.topicTag,
      bankItemId: item.id,
      imageKey: copiedImageKey,
      audioId: linkedAudioId,
      order: i,
      points: entry.points ?? 1,
      options:
        item.options !== null
          ? (item.options as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      answerKey: item.answerKey as Prisma.InputJsonValue,
      rubric:
        item.rubric !== null
          ? (item.rubric as Prisma.InputJsonValue)
          : Prisma.JsonNull,
    });
  }

  if (fieldPayloads.length > 0) {
    await prisma.field.createMany({ data: fieldPayloads });
  }

  return {
    worksheet: ws,
    fieldCount: fieldPayloads.length,
  };
}
