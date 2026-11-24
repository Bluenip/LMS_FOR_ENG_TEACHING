import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/server/auditService";

export async function getAdminSystemStats() {
  const [
    totalUsers,
    teachers,
    students,
    parents,
    classes,
    worksheets,
    assignments,
    submissions,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { role: "TEACHER", deletedAt: null } }),
    prisma.user.count({ where: { role: "STUDENT", deletedAt: null } }),
    prisma.user.count({ where: { role: "PARENT", deletedAt: null } }),
    prisma.class.count(),
    prisma.worksheet.count(),
    prisma.assignment.count(),
    prisma.submission.count(),
  ]);

  return {
    totalUsers,
    teachers,
    students,
    parents,
    classes,
    worksheets,
    assignments,
    submissions,
  };
}

export async function listAllUsers(query?: string, roleFilter?: Role) {
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(query && query.trim().length > 0
        ? {
            OR: [
              { name: { contains: query.trim(), mode: "insensitive" } },
              { email: { contains: query.trim(), mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isLocked: true,
      createdAt: true,
      _count: {
        select: {
          classesTaught: true,
          worksheets: true,
          enrollments: true,
          submissions: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function adminUpdateUser(
  targetUserId: string,
  actorUserId: string,
  input: { role?: Role; isLocked?: boolean }
) {
  if (targetUserId === actorUserId && input.isLocked === true) {
    throw new AppError("Không thể tự khoá tài khoản quản trị viên của chính bạn.", 400, "SELF_LOCK");
  }
  if (targetUserId === actorUserId && input.role !== undefined && input.role !== "ADMIN") {
    throw new AppError("Không thể tự hạ quyền quản trị viên của chính bạn.", 400, "SELF_DEMOTE");
  }
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { name: true, email: true, role: true, isLocked: true },
  });
  if (!target) {
    throw new AppError("Không tìm thấy người dùng.", 404, "NOT_FOUND");
  }
  const roleChanges = input.role !== undefined && input.role !== target.role;
  const lockChanges = input.isLocked !== undefined && input.isLocked !== target.isLocked;
  // a teacher/admin who still owns classes or worksheets must not become a student/parent:
  // they would lose access to all of it (data stays, but nobody can manage those classes)
  if (
    roleChanges &&
    (target.role === "TEACHER" || target.role === "ADMIN") &&
    input.role !== "TEACHER" &&
    input.role !== "ADMIN"
  ) {
    const [classes, worksheets] = await Promise.all([
      prisma.class.count({ where: { teacherId: targetUserId } }),
      prisma.worksheet.count({ where: { ownerId: targetUserId } }),
    ]);
    if (classes > 0 || worksheets > 0) {
      throw new AppError(
        `Không thể đổi vai trò: tài khoản này đang sở hữu ${classes} lớp học và ${worksheets} bài tập. Hãy xoá hoặc chuyển chúng trước.`,
        400,
        "ROLE_HAS_CONTENT",
        { classes, worksheets }
      );
    }
  }
  const removesAdmin =
    target.role === "ADMIN" &&
    !target.isLocked &&
    ((input.role !== undefined && input.role !== "ADMIN") || input.isLocked === true);
  if (removesAdmin) {
    const activeAdmins = await prisma.user.count({
      where: { role: "ADMIN", isLocked: false, deletedAt: null },
    });
    if (activeAdmins <= 1) {
      throw new AppError("Hệ thống phải còn ít nhất một quản trị viên đang hoạt động.", 400, "LAST_ADMIN");
    }
  }
  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: {
      ...(input.role !== undefined ? { role: input.role } : {}),
      // a role change signs the user out everywhere so they come back with the new role
      ...(roleChanges ? { passwordChangedAt: new Date() } : {}),
      ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isLocked: true,
    },
  });

  if (roleChanges) {
    await logAudit({
      actorId: actorUserId,
      action: "USER_ROLE_CHANGED",
      targetType: "USER",
      targetId: targetUserId,
      summary: `Đổi vai trò ${target.name} (${target.email}): ${target.role} → ${updated.role}`,
      summaryEn: `Changed role of ${target.name} (${target.email}): ${target.role} → ${updated.role}`,
      meta: { targetEmail: target.email, previousRole: target.role, nextRole: updated.role },
    });
  }
  if (lockChanges) {
    await logAudit({
      actorId: actorUserId,
      action: updated.isLocked ? "USER_LOCKED" : "USER_UNLOCKED",
      targetType: "USER",
      targetId: targetUserId,
      summary: updated.isLocked
        ? `Khoá tài khoản ${target.name} (${target.email})`
        : `Mở khoá tài khoản ${target.name} (${target.email})`,
      summaryEn: updated.isLocked
        ? `Locked account ${target.name} (${target.email})`
        : `Unlocked account ${target.name} (${target.email})`,
      meta: { targetEmail: target.email, isLocked: updated.isLocked },
    });
  }

  return updated;
}

export async function listAllParentLinks() {
  return prisma.parentLink.findMany({
    include: {
      parent: { select: { id: true, name: true, email: true } },
      student: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createManualParentLink(
  parentId: string,
  studentId: string,
  relation = "Phụ huynh"
) {
  const [parent, student] = await Promise.all([
    prisma.user.findUnique({ where: { id: parentId }, select: { id: true, role: true, deletedAt: true } }),
    prisma.user.findUnique({ where: { id: studentId }, select: { id: true, role: true, deletedAt: true } }),
  ]);

  if (!parent || parent.deletedAt || parent.role !== "PARENT") {
    throw new AppError("Tài khoản phụ huynh không hợp lệ.", 400, "INVALID_PARENT");
  }
  if (!student || student.deletedAt || student.role !== "STUDENT") {
    throw new AppError("Tài khoản học sinh không hợp lệ.", 400, "INVALID_STUDENT");
  }

  return prisma.parentLink.upsert({
    where: { parentId_studentId: { parentId, studentId } },
    create: {
      parentId,
      studentId,
      relation,
      verifiedAt: new Date(),
    },
    update: {
      relation,
      verifiedAt: new Date(),
    },
    include: {
      parent: { select: { id: true, name: true, email: true } },
      student: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function deleteParentLink(linkId: string) {
  return prisma.parentLink.delete({ where: { id: linkId } });
}

/**
 * Lists classes and worksheets owned by a teacher/admin, plus active teachers/admins who can receive them.
 */
export async function getUserOwnedContent(fromUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: fromUserId },
    select: { id: true, name: true, email: true, role: true, deletedAt: true },
  });
  if (!user) {
    throw new AppError("Không tìm thấy người dùng.", 404, "NOT_FOUND");
  }

  const [classes, worksheets, eligibleRecipients] = await Promise.all([
    prisma.class.findMany({
      where: { teacherId: fromUserId },
      select: {
        id: true,
        name: true,
        joinCode: true,
        archived: true,
        _count: { select: { enrollments: true, assignments: true, lessons: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.worksheet.findMany({
      where: { ownerId: fromUserId },
      select: {
        id: true,
        title: true,
        isShared: true,
        _count: { select: { fields: true, assignments: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findMany({
      where: {
        id: { not: fromUserId },
        deletedAt: null,
        isLocked: false,
        role: { in: ["TEACHER", "ADMIN"] },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);

  return { user, classes, worksheets, eligibleRecipients };
}

export interface TransferOwnershipInput {
  toUserId: string;
  transferAll?: boolean;
  classIds?: string[];
  worksheetIds?: string[];
}

/**
 * Transfers selected (or all) classes and/or worksheets from one teacher/admin to another active teacher/admin.
 * Assignments, submissions, and lessons follow their class automatically. Drive files keep their Drive location
 * and only change `ownerId` in the database.
 */
export async function transferOwnership(
  actorId: string,
  fromUserId: string,
  input: TransferOwnershipInput
) {
  if (fromUserId === input.toUserId) {
    throw new AppError("Người nhận phải khác người chuyển.", 400, "SAME_OWNER");
  }

  const [fromUser, toUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: fromUserId },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.user.findUnique({
      where: { id: input.toUserId },
      select: { id: true, name: true, email: true, role: true, isLocked: true, deletedAt: true },
    }),
  ]);

  if (!fromUser) {
    throw new AppError("Không tìm thấy người dùng cần chuyển dữ liệu.", 404, "NOT_FOUND");
  }
  if (!toUser || toUser.deletedAt || toUser.isLocked || (toUser.role !== "TEACHER" && toUser.role !== "ADMIN")) {
    throw new AppError(
      "Người nhận phải là giáo viên hoặc quản trị viên đang hoạt động.",
      400,
      "INVALID_RECIPIENT"
    );
  }

  const uniqueClassIds = Array.from(new Set(input.classIds ?? []));
  const uniqueWorksheetIds = Array.from(new Set(input.worksheetIds ?? []));

  const [classesToMove, worksheetsToMove] = await Promise.all([
    input.transferAll
      ? prisma.class.findMany({
          where: { teacherId: fromUserId },
          select: { id: true, name: true },
        })
      : uniqueClassIds.length > 0
        ? prisma.class.findMany({
            where: { id: { in: uniqueClassIds }, teacherId: fromUserId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    input.transferAll
      ? prisma.worksheet.findMany({
          where: { ownerId: fromUserId },
          select: { id: true, title: true },
        })
      : uniqueWorksheetIds.length > 0
        ? prisma.worksheet.findMany({
            where: { id: { in: uniqueWorksheetIds }, ownerId: fromUserId },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
  ]);

  if (!input.transferAll) {
    if (classesToMove.length !== uniqueClassIds.length || worksheetsToMove.length !== uniqueWorksheetIds.length) {
      throw new AppError(
        "Một hoặc nhiều lớp học / worksheet không thuộc quyền sở hữu của tài khoản nguồn.",
        400,
        "INVALID_TRANSFER_ITEMS"
      );
    }
  }

  if (classesToMove.length === 0 && worksheetsToMove.length === 0) {
    throw new AppError("Không có lớp học hoặc worksheet nào được chọn để chuyển.", 400, "NOTHING_TO_TRANSFER");
  }

  const movedClassIds = classesToMove.map((c) => c.id);
  const movedWorksheetIds = worksheetsToMove.map((w) => w.id);

  const result = await prisma.$transaction(async (tx) => {
    if (movedClassIds.length > 0) {
      await tx.class.updateMany({
        where: { id: { in: movedClassIds }, teacherId: fromUserId },
        data: { teacherId: toUser.id },
      });
    }
    if (movedWorksheetIds.length > 0) {
      await tx.worksheet.updateMany({
        where: { id: { in: movedWorksheetIds }, ownerId: fromUserId },
        data: { ownerId: toUser.id },
      });
    }

    let driveFilesUpdated = 0;
    const driveOrConditions: Array<{ classId: { in: string[] } } | { worksheetId: { in: string[] } }> = [];
    if (movedClassIds.length > 0) driveOrConditions.push({ classId: { in: movedClassIds } });
    if (movedWorksheetIds.length > 0) driveOrConditions.push({ worksheetId: { in: movedWorksheetIds } });

    if (driveOrConditions.length > 0) {
      const dfRes = await tx.driveFile.updateMany({
        where: { ownerId: fromUserId, OR: driveOrConditions },
        data: { ownerId: toUser.id },
      });
      driveFilesUpdated = dfRes.count;
    }

    if (movedClassIds.length > 0) {
      await tx.driveUpload.updateMany({
        where: { ownerId: fromUserId, classId: { in: movedClassIds } },
        data: { ownerId: toUser.id },
      });
    }

    await logAudit(
      {
        actorId,
        action: "OWNERSHIP_TRANSFERRED",
        targetType: "USER",
        targetId: fromUser.id,
        summary: `Chuyển ${movedClassIds.length} lớp và ${movedWorksheetIds.length} worksheet từ ${fromUser.name} (${fromUser.email}) sang ${toUser.name} (${toUser.email})`,
        summaryEn: `Transferred ${movedClassIds.length} class(es) and ${movedWorksheetIds.length} worksheet(s) from ${fromUser.name} (${fromUser.email}) to ${toUser.name} (${toUser.email})`,
        meta: {
          fromUserId: fromUser.id,
          fromEmail: fromUser.email,
          toUserId: toUser.id,
          toEmail: toUser.email,
          transferAll: Boolean(input.transferAll),
          classCount: movedClassIds.length,
          worksheetCount: movedWorksheetIds.length,
          classIds: movedClassIds,
          worksheetIds: movedWorksheetIds,
          driveFilesUpdated,
        },
      },
      tx
    );

    return {
      transferredClasses: movedClassIds.length,
      transferredWorksheets: movedWorksheetIds.length,
      driveFilesUpdated,
      fromUser: { id: fromUser.id, name: fromUser.name, email: fromUser.email },
      toUser: { id: toUser.id, name: toUser.name, email: toUser.email },
    };
  });

  return result;
}
