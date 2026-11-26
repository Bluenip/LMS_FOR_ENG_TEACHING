import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { resolveEffectiveAssignment } from "@/lib/assignment-effective";
import { generateJoinCode } from "@/lib/utils";
import { createNotification } from "./notificationService";
import { enqueueDriveTrashByFileIds } from "./driveService";
import { logAudit } from "@/server/auditService";

async function generateUniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const code = generateJoinCode(6);
    const exists = await prisma.class.findUnique({
      where: { joinCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  throw new AppError("Không thể tạo mã lớp duy nhất, vui lòng thử lại.", 500, "JOIN_CODE_ERROR");
}

/** A teacher's own classes; an admin (`allClasses`) gets every class in the system. */
export async function listTeacherClasses(
  teacherId: string,
  includeArchived = false,
  opts?: { allClasses?: boolean }
) {
  return prisma.class.findMany({
    where: {
      deletedAt: null,
      ...(opts?.allClasses ? {} : { teacherId }),
      ...(includeArchived ? {} : { archived: false }),
    },
    include: {
      teacher: { select: { id: true, name: true } },
      _count: {
        select: {
          enrollments: { where: { status: "ACTIVE" } },
          assignments: true,
          classLessons: { where: { lesson: { deletedAt: null } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listStudentClasses(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, status: "ACTIVE", class: { deletedAt: null } },
    include: {
      class: {
        include: {
          teacher: { select: { id: true, name: true, email: true } },
          _count: {
            select: {
              enrollments: { where: { status: "ACTIVE" } },
              assignments: true,
              classLessons: { where: { lesson: { deletedAt: null } } },
            },
          },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });
  return enrollments.map((e) => e.class);
}

export async function createClass(
  teacherId: string,
  input: { name: string; description?: string | null; requireApproval?: boolean }
) {
  const joinCode = await generateUniqueJoinCode();
  return prisma.class.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      requireApproval: input.requireApproval ?? false,
      joinCode,
      teacherId,
    },
  });
}

export async function updateClass(
  classId: string,
  input: {
    name?: string;
    description?: string | null;
    requireApproval?: boolean;
    archived?: boolean;
  },
  actorId?: string
) {
  const before =
    input.archived !== undefined
      ? await prisma.class.findUnique({
          where: { id: classId },
          select: { name: true, archived: true },
        })
      : null;

  const updated = await prisma.class.update({
    where: { id: classId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.requireApproval !== undefined ? { requireApproval: input.requireApproval } : {}),
      ...(input.archived !== undefined ? { archived: input.archived } : {}),
    },
  });

  if (before && input.archived !== undefined && before.archived !== updated.archived) {
    await logAudit({
      actorId: actorId ?? null,
      action: updated.archived ? "CLASS_ARCHIVED" : "CLASS_UNARCHIVED",
      targetType: "CLASS",
      targetId: updated.id,
      summary: updated.archived
        ? `Lưu trữ (đóng) lớp học: ${updated.name}`
        : `Mở lại lớp học: ${updated.name}`,
      summaryEn: updated.archived
        ? `Archived (closed) class: ${updated.name}`
        : `Reopened class: ${updated.name}`,
      meta: { className: updated.name, archived: updated.archived },
    });
  }

  return updated;
}

export async function regenerateClassJoinCode(classId: string) {
  const joinCode = await generateUniqueJoinCode();
  return prisma.class.update({
    where: { id: classId },
    data: { joinCode },
  });
}

export async function deleteClass(classId: string, actorId?: string) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, teacherId: true },
  });
  // lesson files belong to library lessons (possibly shown in other classes): they are removed
  // only when the lesson or the material itself is deleted
  const driveFiles = await prisma.driveFile.findMany({
    where: { classId, trashedAt: null, kind: { not: "LESSON_FILE" } },
    select: { id: true },
  });
  if (driveFiles.length > 0) {
    await enqueueDriveTrashByFileIds(
      driveFiles.map((f) => f.id),
      "CLASS_DELETED"
    );
  }
  const deleted = await prisma.class.delete({ where: { id: classId } });
  if (cls) {
    await logAudit({
      actorId: actorId ?? null,
      action: "CLASS_DELETED",
      targetType: "CLASS",
      targetId: cls.id,
      summary: `Xoá lớp học: ${cls.name}`,
      summaryEn: `Deleted class: ${cls.name}`,
      meta: { className: cls.name, teacherId: cls.teacherId },
    });
  }
  return deleted;
}

export async function joinClassByCode(studentId: string, joinCode: string) {
  const cls = await prisma.class.findUnique({
    where: { joinCode: joinCode.trim().toUpperCase() },
    include: { teacher: { select: { id: true, name: true } } },
  });
  if (!cls || cls.archived) {
    throw new AppError("Mã lớp không tồn tại hoặc lớp đã đóng.", 404, "CLASS_NOT_FOUND");
  }

  const existing = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId: cls.id, studentId } },
  });
  if (existing) {
    if (existing.status === "ACTIVE") {
      return { enrollment: existing, class: cls, alreadyJoined: true };
    }
    return { enrollment: existing, class: cls, alreadyJoined: false };
  }

  const status = cls.requireApproval ? "PENDING" : "ACTIVE";
  const enrollment = await prisma.enrollment.create({
    data: {
      classId: cls.id,
      studentId,
      status,
    },
  });

  if (status === "PENDING") {
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { name: true },
    });
    await createNotification({
      userId: cls.teacherId,
      type: "ENROLLMENT_REQUEST",
      title: `Yêu cầu vào lớp ${cls.name}`,
      body: `${student?.name ?? "Một học sinh"} vừa xin tham gia lớp ${cls.name}.`,
      link: `/teacher/classes/${cls.id}?tab=students`,
    });
  }

  return { enrollment, class: cls, alreadyJoined: false };
}

export async function getClassDetail(classId: string, opts?: { studentId?: string }) {
  const studentId = opts?.studentId;
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      teacher: { select: { id: true, name: true, email: true } },
      enrollments: {
        where: { student: { deletedAt: null } },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              avatarUrl: true,
              parentLinksAsChild: {
                where: { verifiedAt: { not: null } },
                select: {
                  id: true,
                  relation: true,
                  parent: { select: { id: true, name: true, email: true } },
                },
              },
            },
          },
        },
        orderBy: [{ status: "asc" }, { joinedAt: "asc" }],
      },
      posts: {
        include: {
          author: { select: { id: true, name: true, role: true } },
          comments: {
            include: { author: { select: { id: true, name: true, role: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      classLessons: {
        where: { lesson: { deletedAt: null } },
        include: {
          lesson: {
            include: {
              items: { where: { deletedAt: null }, orderBy: { order: "asc" } },
              owner: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      },
      assignments: {
        ...(studentId
          ? {
              where: {
                OR: [{ targets: { none: {} } }, { targets: { some: { studentId } } }],
              },
            }
          : {}),
        include: {
          worksheet: {
            select: {
              id: true,
              title: true,
              pageCount: true,
              _count: { select: { fields: true } },
            },
          },
          ...(studentId
            ? {
                overrides: {
                  where: { studentId },
                  take: 1,
                },
              }
            : {}),
          _count: {
            select: { submissions: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }
  // lessons now come from the library (ClassLesson); keep the old `lessons` shape for the pages
  const { classLessons, assignments, ...rest } = cls;
  const resolvedAssignments = assignments.map((a) => {
    const maybeOverrides = "overrides" in a && Array.isArray(a.overrides) ? a.overrides : [];
    const effective = studentId ? resolveEffectiveAssignment(a, maybeOverrides[0] ?? null) : null;
    return {
      ...a,
      ...(effective
        ? {
            dueAt: effective.dueAt,
            timeLimitMin: effective.timeLimitMin,
            maxAttempts: effective.maxAttempts,
          }
        : {}),
    };
  });
  return {
    ...rest,
    assignments: resolvedAssignments,
    lessons: classLessons.map((link) => ({ ...link.lesson, order: link.order })),
  };
}

export async function approveEnrollment(classId: string, enrollmentId: string) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, classId },
    include: { class: { select: { name: true } } },
  });
  if (!enrollment) {
    throw new AppError("Không tìm thấy yêu cầu tham gia.", 404, "NOT_FOUND");
  }
  const updated = await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { status: "ACTIVE" },
  });
  await createNotification({
    userId: enrollment.studentId,
    type: "ENROLLMENT_APPROVED",
    title: `Đã được duyệt vào lớp ${enrollment.class.name}`,
    body: `Giáo viên đã chấp nhận yêu cầu tham gia lớp ${enrollment.class.name}.`,
    link: `/student/classes/${classId}`,
  });
  return updated;
}

export async function removeEnrollment(classId: string, enrollmentId: string) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, classId },
  });
  if (!enrollment) {
    throw new AppError("Không tìm thấy học sinh trong lớp.", 404, "NOT_FOUND");
  }
  return prisma.enrollment.delete({ where: { id: enrollment.id } });
}

export async function createPost(classId: string, authorId: string, content: string) {
  return prisma.post.create({
    data: { classId, authorId, content },
    include: {
      author: { select: { id: true, name: true, role: true } },
      comments: true,
    },
  });
}

export async function deletePost(classId: string, postId: string, actorId: string, isTeacher: boolean) {
  const post = await prisma.post.findFirst({ where: { id: postId, classId } });
  if (!post) {
    throw new AppError("Không tìm thấy bài đăng.", 404, "NOT_FOUND");
  }
  if (!isTeacher && post.authorId !== actorId) {
    throw new AppError("Bạn không có quyền xoá bài đăng này.", 403, "FORBIDDEN");
  }
  return prisma.post.delete({ where: { id: post.id } });
}

export async function createComment(classId: string, postId: string, authorId: string, content: string) {
  const post = await prisma.post.findFirst({ where: { id: postId, classId } });
  if (!post) {
    throw new AppError("Không tìm thấy bài đăng.", 404, "NOT_FOUND");
  }
  return prisma.comment.create({
    data: { postId, authorId, content },
    include: { author: { select: { id: true, name: true, role: true } } },
  });
}

/**
 * Bulk import students into a class from an uploaded Excel (.xlsx) file.
 * Columns: A = Name, B = Email, C = Password (optional, default "12345678")
 */
export async function importStudentsFromExcel(classId: string, buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS expects ArrayBuffer/Uint8Array cleanly under Node 22 types
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new AppError("File Excel không có trang tính nào.", 400, "EMPTY_EXCEL");
  }

  let createdCount = 0;
  let enrolledCount = 0;
  const skipped: string[] = [];

  const rows: Array<{ name: string; email: string; password: string }> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      const firstCell = String(row.getCell(1).value ?? "").toLowerCase();
      if (firstCell.includes("tên") || firstCell.includes("name") || firstCell.includes("họ")) {
        return; // skip header row
      }
    }
    const name = String(row.getCell(1).text ?? row.getCell(1).value ?? "").trim();
    const email = String(row.getCell(2).text ?? row.getCell(2).value ?? "")
      .trim()
      .toLowerCase();
    const password = String(row.getCell(3).text ?? row.getCell(3).value ?? "").trim() || "12345678";
    if (!name || !email || !email.includes("@")) {
      if (name || email) skipped.push(`Dòng ${rowNumber}: thiếu họ tên hoặc email hợp lệ`);
      return;
    }
    rows.push({ name, email, password });
  });

  if (rows.length === 0) {
    throw new AppError("Không tìm thấy dữ liệu học sinh hợp lệ trong file Excel.", 400, "NO_ROWS");
  }

  for (const row of rows) {
    let user = await prisma.user.findUnique({ where: { email: row.email } });
    if (!user) {
      const passwordHash = await bcrypt.hash(row.password, 10);
      user = await prisma.user.create({
        data: {
          name: row.name,
          email: row.email,
          passwordHash,
          role: "STUDENT",
        },
      });
      createdCount++;
    } else if (user.role !== "STUDENT") {
      skipped.push(`${row.email}: không phải tài khoản học sinh`);
      continue;
    }

    const existing = await prisma.enrollment.findUnique({
      where: { classId_studentId: { classId, studentId: user.id } },
    });
    if (!existing) {
      await prisma.enrollment.create({
        data: { classId, studentId: user.id, status: "ACTIVE" },
      });
      enrolledCount++;
    } else if (existing.status === "PENDING") {
      await prisma.enrollment.update({
        where: { id: existing.id },
        data: { status: "ACTIVE" },
      });
      enrolledCount++;
    }
  }

  return { createdCount, enrolledCount, skipped, totalProcessed: rows.length };
}
