import { Prisma, type FieldPlacement, type FieldType, type SkillTag, type WorksheetSubject } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/server/auditService";

interface VersionFieldSnapshot {
  placement: FieldPlacement;
  type: FieldType;
  label: string;
  prompt: string | null;
  explanation: string | null;
  skillTag: SkillTag | null;
  topicTag: string | null;
  order: number;
  points: number;
  pageIndex: number | null;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  style: unknown;
  options: unknown;
  answerKey: unknown;
  rubric: unknown;
  gradingOpts: unknown;
}

interface WorksheetSnapshotPayload {
  title: string;
  subject: WorksheetSubject;
  instructions: string | null;
  passages: unknown;
  fields: VersionFieldSnapshot[];
}

const MAX_RETAINED_VERSIONS = 30;

export async function createWorksheetSnapshot(
  worksheetId: string,
  actorId?: string | null,
  note?: string | null
) {
  const ws = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    include: {
      fields: { orderBy: { order: "asc" } },
    },
  });
  if (!ws || ws.deletedAt) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }

  const latest = await prisma.worksheetVersion.findFirst({
    where: { worksheetId },
    orderBy: { versionNo: "desc" },
    select: { versionNo: true },
  });
  const nextVersionNo = (latest?.versionNo ?? 0) + 1;

  const snapshot: WorksheetSnapshotPayload = {
    title: ws.title,
    subject: ws.subject,
    instructions: ws.instructions,
    passages: ws.passages,
    fields: ws.fields.map((f) => ({
      placement: f.placement,
      type: f.type,
      label: f.label,
      prompt: f.prompt,
      explanation: f.explanation,
      skillTag: f.skillTag,
      topicTag: f.topicTag,
      order: f.order,
      points: f.points,
      pageIndex: f.pageIndex,
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      style: f.style,
      options: f.options,
      answerKey: f.answerKey,
      rubric: f.rubric,
      gradingOpts: f.gradingOpts,
    })),
  };

  const created = await prisma.worksheetVersion.create({
    data: {
      worksheetId,
      versionNo: nextVersionNo,
      note: note?.trim() || null,
      createdById: actorId ?? null,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  // Retain only newest 30 versions
  const stale = await prisma.worksheetVersion.findMany({
    where: { worksheetId },
    orderBy: { versionNo: "desc" },
    skip: MAX_RETAINED_VERSIONS,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.worksheetVersion.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
  }

  return created;
}

export async function listWorksheetVersions(worksheetId: string) {
  const ws = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    select: {
      id: true,
      title: true,
      _count: { select: { fields: true } },
    },
  });
  if (!ws) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }

  const [versions, submissionCount] = await Promise.all([
    prisma.worksheetVersion.findMany({
      where: { worksheetId },
      orderBy: { versionNo: "desc" },
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.submission.count({
      where: { assignment: { worksheetId, class: { deletedAt: null } } },
    }),
  ]);

  return {
    currentFieldCount: ws._count.fields,
    hasSubmissions: submissionCount > 0,
    versions: versions.map((v) => {
      const snap = v.snapshot as unknown as WorksheetSnapshotPayload;
      const fields = Array.isArray(snap?.fields) ? snap.fields : [];
      return {
        id: v.id,
        versionNo: v.versionNo,
        note: v.note,
        createdAt: v.createdAt.toISOString(),
        createdByName: v.createdBy?.name ?? "Pivora",
        title: snap?.title ?? ws.title,
        fieldCount: fields.length,
        fieldDelta: fields.length - ws._count.fields,
      };
    }),
  };
}

/**
 * Restores a worksheet version safely:
 * - If existing student submissions point to this worksheet, clones into a brand-new worksheet
 *   so historical student answers and grades remain 100% intact.
 * - If zero submissions exist, restores in place while saving an automatic pre-restore snapshot.
 */
export async function restoreWorksheetVersion(
  worksheetId: string,
  versionId: string,
  actorId?: string | null
) {
  const [ws, version] = await Promise.all([
    prisma.worksheet.findUnique({
      where: { id: worksheetId },
      select: { id: true, ownerId: true, subject: true, deletedAt: true },
    }),
    prisma.worksheetVersion.findFirst({
      where: { id: versionId, worksheetId },
    }),
  ]);
  if (!ws || ws.deletedAt || !version) {
    throw new AppError("Không tìm thấy phiên bản phiếu bài tập.", 404, "NOT_FOUND");
  }

  const snap = version.snapshot as unknown as WorksheetSnapshotPayload;
  const fields = Array.isArray(snap?.fields) ? snap.fields : [];
  const submissionCount = await prisma.submission.count({
    where: { assignment: { worksheetId, class: { deletedAt: null } } },
  });

  if (submissionCount > 0) {
    const clonedTitle = `${snap.title} (Khôi phục v${version.versionNo})`;
    const cloned = await prisma.worksheet.create({
      data: {
        ownerId: ws.ownerId,
        title: clonedTitle,
        subject: snap.subject ?? ws.subject,
        instructions: snap.instructions ?? null,
        passages:
          snap.passages === null || snap.passages === undefined
            ? Prisma.JsonNull
            : (snap.passages as Prisma.InputJsonValue),
        fields: {
          create: fields.map((f, idx) => ({
            placement: f.placement,
            type: f.type,
            label: f.label,
            prompt: f.prompt,
            explanation: f.explanation,
            skillTag: f.skillTag,
            topicTag: f.topicTag,
            order: typeof f.order === "number" ? f.order : idx,
            points: typeof f.points === "number" ? f.points : 1,
            pageIndex: f.pageIndex,
            x: f.x,
            y: f.y,
            w: f.w,
            h: f.h,
            style: f.style ? (f.style as Prisma.InputJsonValue) : Prisma.JsonNull,
            options: f.options ? (f.options as Prisma.InputJsonValue) : Prisma.JsonNull,
            answerKey: (f.answerKey ?? {}) as Prisma.InputJsonValue,
            rubric: f.rubric ? (f.rubric as Prisma.InputJsonValue) : Prisma.JsonNull,
            gradingOpts: f.gradingOpts ? (f.gradingOpts as Prisma.InputJsonValue) : Prisma.JsonNull,
          })),
        },
      },
    });

    await logAudit({
      actorId: actorId ?? null,
      action: "WORKSHEET_VERSION_RESTORED",
      targetType: "WORKSHEET",
      targetId: cloned.id,
      summary: `Khôi phục v${version.versionNo} thành bản sao "${clonedTitle}"`,
      meta: { sourceWorksheetId: worksheetId, versionNo: version.versionNo, mode: "CLONED" },
    });

    return { mode: "CLONED" as const, worksheetId: cloned.id, title: cloned.title };
  }

  // Zero submissions exist -> safe in-place restore after taking safety snapshot
  await createWorksheetSnapshot(worksheetId, actorId, `Trước khi khôi phục v${version.versionNo}`);

  await prisma.$transaction(async (tx) => {
    await tx.field.deleteMany({ where: { worksheetId } });
    await tx.worksheet.update({
      where: { id: worksheetId },
      data: {
        title: snap.title,
        subject: snap.subject ?? ws.subject,
        instructions: snap.instructions ?? null,
        passages:
          snap.passages === null || snap.passages === undefined
            ? Prisma.JsonNull
            : (snap.passages as Prisma.InputJsonValue),
      },
    });
    if (fields.length > 0) {
      await tx.field.createMany({
        data: fields.map((f, idx) => ({
          worksheetId,
          placement: f.placement,
          type: f.type,
          label: f.label,
          prompt: f.prompt,
          explanation: f.explanation,
          skillTag: f.skillTag,
          topicTag: f.topicTag,
          order: typeof f.order === "number" ? f.order : idx,
          points: typeof f.points === "number" ? f.points : 1,
          pageIndex: f.pageIndex,
          x: f.x,
          y: f.y,
          w: f.w,
          h: f.h,
          style: f.style ? (f.style as Prisma.InputJsonValue) : Prisma.JsonNull,
          options: f.options ? (f.options as Prisma.InputJsonValue) : Prisma.JsonNull,
          answerKey: (f.answerKey ?? {}) as Prisma.InputJsonValue,
          rubric: f.rubric ? (f.rubric as Prisma.InputJsonValue) : Prisma.JsonNull,
          gradingOpts: f.gradingOpts ? (f.gradingOpts as Prisma.InputJsonValue) : Prisma.JsonNull,
        })),
      });
    }
  });

  await logAudit({
    actorId: actorId ?? null,
    action: "WORKSHEET_VERSION_RESTORED",
    targetType: "WORKSHEET",
    targetId: worksheetId,
    summary: `Khôi phục tại chỗ phiên bản v${version.versionNo} (${snap.title})`,
    meta: { versionNo: version.versionNo, mode: "IN_PLACE" },
  });

  return { mode: "IN_PLACE" as const, worksheetId, title: snap.title };
}
