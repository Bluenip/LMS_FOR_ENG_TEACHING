import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

const MAX_PRESETS_PER_TEACHER = 100;

export async function listCommentPresets(teacherId: string) {
  return prisma.teacherCommentPreset.findMany({
    where: { teacherId },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });
}

export async function createCommentPreset(
  teacherId: string,
  input: { content: string; category?: string | null }
) {
  const count = await prisma.teacherCommentPreset.count({
    where: { teacherId },
  });
  if (count >= MAX_PRESETS_PER_TEACHER) {
    throw new AppError("Số lượng câu nhận xét mẫu đã đạt tối đa (100).", 400, "LIMIT_REACHED");
  }

  return prisma.teacherCommentPreset.create({
    data: {
      teacherId,
      content: input.content.trim(),
      category: input.category?.trim() || null,
      order: count,
    },
  });
}

export async function deleteCommentPreset(
  presetId: string,
  actorId: string,
  isAdmin: boolean
) {
  const existing = await prisma.teacherCommentPreset.findUnique({
    where: { id: presetId },
    select: { id: true, teacherId: true },
  });
  if (!existing) {
    throw new AppError("Không tìm thấy câu nhận xét mẫu.", 404, "NOT_FOUND");
  }
  if (!isAdmin && existing.teacherId !== actorId) {
    throw new AppError("Bạn không có quyền xoá câu nhận xét mẫu này.", 403, "FORBIDDEN");
  }

  await prisma.teacherCommentPreset.delete({
    where: { id: presetId },
  });
  return { ok: true };
}
