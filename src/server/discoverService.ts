import type { Prisma, Role, WorksheetSubject } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { WORKSHEET_SUBJECTS } from "@/lib/subjects";
import { logAudit } from "@/server/auditService";
import { STUDENT_FIELD_SELECT } from "@/server/worksheetService";
import { cloneWorksheetForTeacher } from "@/server/worksheetTransferService";

export type DiscoverSort = "likes" | "recent" | "fields";

export async function listDiscoverWorksheets(opts: {
  q?: string | null;
  subject?: string | null;
  publicLevel?: string | null;
  sort?: string | null;
  viewerId?: string | null;
  limit?: number;
}) {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 60);
  const q = opts.q?.trim();
  const subjectFilter =
    opts.subject && WORKSHEET_SUBJECTS.includes(opts.subject as WorksheetSubject)
      ? (opts.subject as WorksheetSubject)
      : undefined;
  const levelFilter = opts.publicLevel?.trim() || undefined;

  const where: Prisma.WorksheetWhereInput = {
    isPublic: true,
    publicHiddenByAdmin: false,
    deletedAt: null,
    ...(subjectFilter ? { subject: subjectFilter } : {}),
    ...(levelFilter ? { publicLevel: levelFilter } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { instructions: { contains: q, mode: "insensitive" } },
            { owner: { name: { contains: q, mode: "insensitive" } } },
            { tags: { has: q } },
          ],
        }
      : {}),
  };

  let orderBy: Prisma.WorksheetOrderByWithRelationInput[] = [
    { likeCount: "desc" },
    { updatedAt: "desc" },
  ];
  if (opts.sort === "recent") {
    orderBy = [{ createdAt: "desc" }];
  } else if (opts.sort === "fields") {
    orderBy = [{ fields: { _count: "desc" } }, { likeCount: "desc" }];
  }

  const rows = await prisma.worksheet.findMany({
    where,
    take: limit,
    orderBy,
    select: {
      id: true,
      title: true,
      subject: true,
      publicLevel: true,
      tags: true,
      instructions: true,
      pageCount: true,
      likeCount: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { fields: true, likes: true } },
    },
  });

  const viewerId = opts.viewerId;
  let likedSet = new Set<string>();
  let followingSet = new Set<string>();
  if (viewerId && rows.length > 0) {
    const [likes, follows] = await Promise.all([
      prisma.worksheetLike.findMany({
        where: { userId: viewerId, worksheetId: { in: rows.map((r) => r.id) } },
        select: { worksheetId: true },
      }),
      prisma.teacherFollow.findMany({
        where: {
          followerId: viewerId,
          teacherId: { in: Array.from(new Set(rows.map((r) => r.owner.id))) },
        },
        select: { teacherId: true },
      }),
    ]);
    likedSet = new Set(likes.map((l) => l.worksheetId));
    followingSet = new Set(follows.map((f) => f.teacherId));
  }

  return rows.map((r) => ({
    ...r,
    likedByViewer: likedSet.has(r.id),
    followingOwner: followingSet.has(r.owner.id),
  }));
}

export async function getDiscoverWorksheetDetail(worksheetId: string, viewerId?: string | null) {
  const worksheet = await prisma.worksheet.findFirst({
    where: {
      id: worksheetId,
      isPublic: true,
      publicHiddenByAdmin: false,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      subject: true,
      publicLevel: true,
      tags: true,
      instructions: true,
      passages: true,
      pdfFileKey: true,
      pageCount: true,
      likeCount: true,
      createdAt: true,
      updatedAt: true,
      owner: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          _count: { select: { teacherFollowers: true } },
        },
      },
      pages: { orderBy: { pageIndex: "asc" } },
      audios: {
        orderBy: { order: "asc" },
        select: { id: true, title: true, order: true, durationSec: true },
      },
      fields: {
        orderBy: [{ pageIndex: "asc" }, { order: "asc" }],
        select: STUDENT_FIELD_SELECT,
      },
      _count: { select: { fields: true, likes: true } },
    },
  });

  if (!worksheet) {
    throw new AppError("Không tìm thấy phiếu bài tập công khai.", 404, "NOT_FOUND");
  }

  let likedByViewer = false;
  let followingOwner = false;
  if (viewerId) {
    const [like, follow] = await Promise.all([
      prisma.worksheetLike.findUnique({
        where: { worksheetId_userId: { worksheetId, userId: viewerId } },
        select: { worksheetId: true },
      }),
      prisma.teacherFollow.findUnique({
        where: { followerId_teacherId: { followerId: viewerId, teacherId: worksheet.owner.id } },
        select: { teacherId: true },
      }),
    ]);
    likedByViewer = Boolean(like);
    followingOwner = Boolean(follow);
  }

  return {
    ...worksheet,
    likedByViewer,
    followingOwner,
  };
}

export async function toggleWorksheetLike(worksheetId: string, userId: string) {
  const ws = await prisma.worksheet.findFirst({
    where: {
      id: worksheetId,
      isPublic: true,
      publicHiddenByAdmin: false,
      deletedAt: null,
    },
    select: { id: true, likeCount: true },
  });
  if (!ws) {
    throw new AppError("Không tìm thấy phiếu bài tập công khai.", 404, "NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.worksheetLike.findUnique({
      where: { worksheetId_userId: { worksheetId, userId } },
    });
    if (existing) {
      await tx.worksheetLike.delete({
        where: { worksheetId_userId: { worksheetId, userId } },
      });
      const count = await tx.worksheetLike.count({ where: { worksheetId } });
      await tx.worksheet.update({
        where: { id: worksheetId },
        data: { likeCount: count },
      });
      return { liked: false, likeCount: count };
    }

    await tx.worksheetLike.create({
      data: { worksheetId, userId },
    });
    const count = await tx.worksheetLike.count({ where: { worksheetId } });
    await tx.worksheet.update({
      where: { id: worksheetId },
      data: { likeCount: count },
    });
    return { liked: true, likeCount: count };
  });
}

export async function cloneDiscoverWorksheet(
  worksheetId: string,
  actor: { id: string; role: Role }
) {
  const ws = await prisma.worksheet.findFirst({
    where: {
      id: worksheetId,
      isPublic: true,
      publicHiddenByAdmin: false,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!ws) {
    throw new AppError("Không tìm thấy phiếu bài tập công khai để sao chép.", 404, "NOT_FOUND");
  }

  return cloneWorksheetForTeacher(worksheetId, actor.id, {
    isAdmin: actor.role === "ADMIN",
    allowPublic: true,
  });
}

export async function reportDiscoverWorksheet(
  worksheetId: string,
  reporterId: string,
  reason: string
) {
  const ws = await prisma.worksheet.findFirst({
    where: {
      id: worksheetId,
      isPublic: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!ws) {
    throw new AppError("Không tìm thấy phiếu bài tập công khai.", 404, "NOT_FOUND");
  }

  const existingOpen = await prisma.contentReport.findFirst({
    where: { worksheetId, reporterId, status: "OPEN" },
  });
  if (existingOpen) {
    return prisma.contentReport.update({
      where: { id: existingOpen.id },
      data: { reason },
    });
  }

  return prisma.contentReport.create({
    data: {
      worksheetId,
      reporterId,
      reason,
      status: "OPEN",
    },
  });
}

export async function getTeacherPublicProfile(teacherId: string, viewerId?: string | null) {
  const teacher = await prisma.user.findFirst({
    where: {
      id: teacherId,
      role: { in: ["TEACHER", "ADMIN"] },
      isLocked: false,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
      _count: {
        select: {
          teacherFollowers: true,
          worksheets: {
            where: { isPublic: true, publicHiddenByAdmin: false, deletedAt: null },
          },
        },
      },
    },
  });
  if (!teacher) {
    throw new AppError("Không tìm thấy hồ sơ giáo viên.", 404, "NOT_FOUND");
  }

  const publicWorksheets = await prisma.worksheet.findMany({
    where: {
      ownerId: teacherId,
      isPublic: true,
      publicHiddenByAdmin: false,
      deletedAt: null,
    },
    orderBy: [{ likeCount: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      subject: true,
      publicLevel: true,
      tags: true,
      likeCount: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { fields: true } },
    },
  });

  let following = false;
  if (viewerId && viewerId !== teacherId) {
    const row = await prisma.teacherFollow.findUnique({
      where: { followerId_teacherId: { followerId: viewerId, teacherId } },
      select: { teacherId: true },
    });
    following = Boolean(row);
  }

  return {
    teacher: {
      id: teacher.id,
      name: teacher.name,
      avatarUrl: teacher.avatarUrl,
      role: teacher.role,
      createdAt: teacher.createdAt,
      followersCount: teacher._count.teacherFollowers,
      publicWorksheetsCount: teacher._count.worksheets,
    },
    following,
    worksheets: publicWorksheets,
  };
}

export async function toggleTeacherFollow(teacherId: string, followerId: string) {
  if (teacherId === followerId) {
    throw new AppError("Bạn không thể tự theo dõi chính mình.", 400, "SELF_FOLLOW");
  }

  const teacher = await prisma.user.findFirst({
    where: {
      id: teacherId,
      role: { in: ["TEACHER", "ADMIN"] },
      isLocked: false,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!teacher) {
    throw new AppError("Không tìm thấy giáo viên.", 404, "NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.teacherFollow.findUnique({
      where: { followerId_teacherId: { followerId, teacherId } },
    });
    if (existing) {
      await tx.teacherFollow.delete({
        where: { followerId_teacherId: { followerId, teacherId } },
      });
    } else {
      await tx.teacherFollow.create({
        data: { followerId, teacherId },
      });
    }
    const followersCount = await tx.teacherFollow.count({ where: { teacherId } });
    return { following: !existing, followersCount };
  });
}

export async function listContentReports(status?: string | null) {
  const reports = await prisma.contentReport.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ createdAt: "desc" }],
    include: {
      worksheet: {
        select: {
          id: true,
          title: true,
          subject: true,
          isPublic: true,
          publicHiddenByAdmin: true,
          deletedAt: true,
          owner: { select: { id: true, name: true, email: true } },
        },
      },
      reporter: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    take: 100,
  });

  return reports.sort((a, b) => {
    if (a.status === "OPEN" && b.status !== "OPEN") return -1;
    if (a.status !== "OPEN" && b.status === "OPEN") return 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function moderateContentReport(
  reportId: string,
  adminId: string,
  action: "HIDE" | "DISMISS" | "RESTORE"
) {
  const report = await prisma.contentReport.findUnique({
    where: { id: reportId },
    select: { id: true, worksheetId: true, status: true },
  });
  if (!report) {
    throw new AppError("Không tìm thấy báo cáo vi phạm.", 404, "NOT_FOUND");
  }

  const nextStatus = action === "HIDE" ? "HIDDEN" : "DISMISSED";

  const updated = await prisma.$transaction(async (tx) => {
    if (action === "HIDE") {
      await tx.worksheet.update({
        where: { id: report.worksheetId },
        data: { publicHiddenByAdmin: true },
      });
      await tx.contentReport.updateMany({
        where: { worksheetId: report.worksheetId, status: "OPEN", id: { not: reportId } },
        data: {
          status: "HIDDEN",
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });
    } else if (action === "RESTORE") {
      await tx.worksheet.update({
        where: { id: report.worksheetId },
        data: { publicHiddenByAdmin: false },
      });
    }

    return tx.contentReport.update({
      where: { id: reportId },
      data: {
        status: nextStatus,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
      include: {
        worksheet: {
          select: {
            id: true,
            title: true,
            publicHiddenByAdmin: true,
          },
        },
      },
    });
  });

  await logAudit({
    actorId: adminId,
    action: "CONTENT_REPORT_MODERATED",
    targetType: "WORKSHEET",
    targetId: report.worksheetId,
    summary: `Kiểm duyệt báo cáo phiếu #${report.worksheetId}: ${nextStatus}`,
    meta: { reportId, worksheetId: report.worksheetId, action },
  }).catch(() => undefined);

  return updated;
}
