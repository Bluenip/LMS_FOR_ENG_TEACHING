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
    prisma.user.findUnique({ where: { id: parentId }, select: { id: true, role: true } }),
    prisma.user.findUnique({ where: { id: studentId }, select: { id: true, role: true } }),
  ]);

  if (!parent || parent.role !== "PARENT") {
    throw new AppError("Tài khoản phụ huynh không hợp lệ.", 400, "INVALID_PARENT");
  }
  if (!student || student.role !== "STUDENT") {
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
