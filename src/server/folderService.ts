import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { buildFolderTree, wouldCreateFolderCycle } from "@/lib/folders/tree";

export async function listUserFolders(ownerId: string, kind?: "WORKSHEET" | "LESSON") {
  const rows = await prisma.libraryFolder.findMany({
    where: {
      ownerId,
      ...(kind ? { kind } : {}),
    },
    orderBy: [{ name: "asc" }],
    include: {
      _count: {
        select: {
          worksheets: { where: { deletedAt: null } },
          lessons: { where: { deletedAt: null } },
        },
      },
    },
  });

  const flat = rows.map((r) => ({
    id: r.id,
    ownerId: r.ownerId,
    parentId: r.parentId,
    kind: r.kind,
    name: r.name,
    color: r.color,
    worksheetCount: r._count.worksheets,
    lessonCount: r._count.lessons,
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    folders: flat,
    tree: buildFolderTree(flat),
  };
}

export async function createUserFolder(
  ownerId: string,
  input: {
    kind: "WORKSHEET" | "LESSON";
    name: string;
    parentId?: string | null;
    color?: string | null;
  }
) {
  if (input.parentId) {
    const parent = await prisma.libraryFolder.findUnique({
      where: { id: input.parentId },
      select: { id: true, ownerId: true, kind: true },
    });
    if (!parent || parent.ownerId !== ownerId || parent.kind !== input.kind) {
      throw new AppError("Không tìm thấy thư mục.", 404, "NOT_FOUND");
    }
  }

  return prisma.libraryFolder.create({
    data: {
      ownerId,
      kind: input.kind,
      name: input.name.trim(),
      parentId: input.parentId ?? null,
      color: input.color ?? null,
    },
  });
}

export async function updateUserFolder(
  ownerId: string,
  folderId: string,
  input: { name?: string; parentId?: string | null; color?: string | null }
) {
  const existing = await prisma.libraryFolder.findUnique({
    where: { id: folderId },
    select: { id: true, ownerId: true, kind: true },
  });
  if (!existing || existing.ownerId !== ownerId) {
    throw new AppError("Không tìm thấy thư mục.", 404, "NOT_FOUND");
  }

  if (input.parentId !== undefined) {
    if (input.parentId) {
      const parent = await prisma.libraryFolder.findUnique({
        where: { id: input.parentId },
        select: { id: true, ownerId: true, kind: true },
      });
      if (!parent || parent.ownerId !== ownerId || parent.kind !== existing.kind) {
        throw new AppError("Không tìm thấy thư mục.", 404, "NOT_FOUND");
      }
    }

    const allOwned = await prisma.libraryFolder.findMany({
      where: { ownerId, kind: existing.kind },
      select: { id: true, parentId: true },
    });
    if (wouldCreateFolderCycle(allOwned, folderId, input.parentId ?? null)) {
      throw new AppError(
        "Không thể đặt thư mục con làm thư mục cha (tạo vòng lặp).",
        400,
        "VALIDATION_ERROR"
      );
    }
  }

  return prisma.libraryFolder.update({
    where: { id: folderId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });
}

export async function deleteUserFolder(ownerId: string, folderId: string) {
  const existing = await prisma.libraryFolder.findUnique({
    where: { id: folderId },
    select: { id: true, ownerId: true, parentId: true },
  });
  if (!existing || existing.ownerId !== ownerId) {
    throw new AppError("Không tìm thấy thư mục.", 404, "NOT_FOUND");
  }

  await prisma.$transaction([
    prisma.libraryFolder.updateMany({
      where: { parentId: folderId },
      data: { parentId: existing.parentId },
    }),
    prisma.worksheet.updateMany({
      where: { folderId },
      data: { folderId: null },
    }),
    prisma.lesson.updateMany({
      where: { folderId },
      data: { folderId: null },
    }),
    prisma.libraryFolder.delete({ where: { id: folderId } }),
  ]);

  return { ok: true };
}
