import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import type { ClassRole, SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { resolveEffectiveAssignment } from "@/lib/assignment-effective";
import { generateJoinCode } from "@/lib/utils";
import { createNotification } from "./notificationService";
import { enqueueDriveTrashByFileIds } from "./driveService";
import { logAudit } from "@/server/auditService";
import { getClassLessonProgress } from "./lessonProgressService";
import {
  createComment,
  createPost,
  deletePost,
  POST_RICH_INCLUDE,
  serializePostForViewer,
} from "./postService";

export { createComment, createPost, deletePost };

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

/** A teacher's own + co-taught classes (owned classes first); an admin (`allClasses`) gets every class. */
export async function listTeacherClasses(
  teacherId: string,
  includeArchived = false,
  opts?: { allClasses?: boolean }
) {
  const rows = await prisma.class.findMany({
    where: {
      deletedAt: null,
      ...(opts?.allClasses
        ? {}
        : {
            OR: [
              { teacherId },
              { classTeachers: { some: { userId: teacherId } } },
            ],
          }),
      ...(includeArchived ? {} : { archived: false }),
    },
    include: {
      teacher: { select: { id: true, name: true } },
      classTeachers: {
        where: { userId: teacherId },
        select: { role: true },
      },
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

  const mapped = rows.map(({ classTeachers, ...c }) => {
    const myRole: ClassRole =
      opts?.allClasses || c.teacherId === teacherId
        ? "OWNER"
        : (classTeachers[0]?.role ?? "CO_TEACHER");
    return { ...c, myRole };
  });

  // Always list OWNER classes before co-taught/assistant classes
  mapped.sort((a, b) => {
    const aOwned = a.teacherId === teacherId ? 0 : 1;
    const bOwned = b.teacherId === teacherId ? 0 : 1;
    if (aOwned !== bOwned) return aOwned - bOwned;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return mapped;
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

export async function getClassDetail(
  classId: string,
  opts?: { studentId?: string; viewerId?: string }
) {
  const studentId = opts?.studentId;
  const viewerId = opts?.viewerId ?? opts?.studentId;
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      teacher: { select: { id: true, name: true, email: true } },
      classTeachers: {
        where: { user: { deletedAt: null } },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
      },
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
        include: POST_RICH_INCLUDE,
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
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
          workbook: { select: { id: true, title: true } },
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

  const [lessonProgress, submittedAssignmentIds] = await Promise.all([
    getClassLessonProgress(classId, { studentId }),
    studentId
      ? prisma.submission.findMany({
          where: {
            studentId,
            status: { in: ["SUBMITTED", "GRADED"] },
            assignment: { classId },
          },
          select: { assignmentId: true },
        })
      : Promise.resolve([]),
  ]);
  const completedPrereqSet = new Set(submittedAssignmentIds.map((s) => s.assignmentId));

  // Build workbook summaries assigned to this class
  const wbMap = new Map<string, { id: string; title: string; assignmentCount: number }>();
  for (const a of cls.assignments) {
    if (!a.workbook) continue;
    const cur = wbMap.get(a.workbook.id) ?? {
      id: a.workbook.id,
      title: a.workbook.title,
      assignmentCount: 0,
    };
    cur.assignmentCount += 1;
    wbMap.set(a.workbook.id, cur);
  }

  // lessons now come from the library (ClassLesson); keep the old `lessons` shape for the pages
  const { classLessons, assignments, posts, ...rest } = cls;
  const resolvedAssignments = assignments.map((a) => {
    const maybeOverrides = "overrides" in a && Array.isArray(a.overrides) ? a.overrides : [];
    const effective = studentId ? resolveEffectiveAssignment(a, maybeOverrides[0] ?? null) : null;
    const isLockedByPrerequisite = Boolean(
      studentId &&
        a.unlockAfterAssignmentId &&
        !completedPrereqSet.has(a.unlockAfterAssignmentId)
    );
    return {
      ...a,
      isLockedByPrerequisite,
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
    posts: posts.map((p) => serializePostForViewer(p, viewerId)),
    assignments: resolvedAssignments,
    workbooks: Array.from(wbMap.values()),
    lessonActiveStudentCount: lessonProgress.activeStudentCount,
    lessons: classLessons.map((link) => ({
      ...link.lesson,
      order: link.order,
      items: link.lesson.items.map((it) => ({
        ...it,
        completedCount: lessonProgress.byItem[it.id]?.completedCount ?? 0,
        completedByMe: lessonProgress.byItem[it.id]?.completedByMe ?? false,
      })),
    })),
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

/** Lists class owner + invited co-teachers & teaching assistants. */
export async function listClassTeachers(classId: string) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      teacher: { select: { id: true, name: true, email: true, role: true } },
      classTeachers: {
        where: { user: { deletedAt: null } },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }
  return {
    owner: cls.teacher,
    teachers: cls.classTeachers.map((ct) => ({
      id: ct.id,
      userId: ct.userId,
      role: ct.role,
      createdAt: ct.createdAt.toISOString(),
      user: ct.user,
    })),
  };
}

export async function manageClassTeachers(
  classId: string,
  input: { email: string; role: "CO_TEACHER" | "ASSISTANT" }
) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, teacherId: true, name: true, deletedAt: true },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }

  const user = await prisma.user.findFirst({
    where: { email: input.email.trim().toLowerCase(), deletedAt: null },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) {
    throw new AppError("Không tìm thấy người dùng.", 404, "NOT_FOUND");
  }
  if (user.role !== "TEACHER" && user.role !== "ADMIN") {
    throw new AppError(
      "Tài khoản này không phải giáo viên hoặc quản trị viên.",
      400,
      "INVALID_ROLE"
    );
  }
  if (user.id === cls.teacherId) {
    throw new AppError(
      "Chủ sở hữu lớp đã là giáo viên chính rồi.",
      400,
      "ALREADY_OWNER"
    );
  }

  await prisma.classTeacher.upsert({
    where: { classId_userId: { classId, userId: user.id } },
    update: { role: input.role },
    create: { classId, userId: user.id, role: input.role },
  });

  return listClassTeachers(classId);
}

export async function updateClassTeacherRole(
  classId: string,
  userId: string,
  role: "CO_TEACHER" | "ASSISTANT"
) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { teacherId: true, deletedAt: true },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }
  if (userId === cls.teacherId) {
    throw new AppError(
      "Chủ sở hữu lớp đã là giáo viên chính rồi.",
      400,
      "ALREADY_OWNER"
    );
  }
  const existing = await prisma.classTeacher.findUnique({
    where: { classId_userId: { classId, userId } },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError("Không tìm thấy đồng giáo viên trong lớp.", 404, "NOT_FOUND");
  }
  await prisma.classTeacher.update({
    where: { id: existing.id },
    data: { role },
  });
  return listClassTeachers(classId);
}

export async function removeClassTeacher(classId: string, userId: string) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { teacherId: true, deletedAt: true },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }
  if (userId === cls.teacherId) {
    throw new AppError(
      "Không thể gỡ chủ sở hữu gốc khỏi danh sách giáo viên lớp.",
      400,
      "CANNOT_REMOVE_OWNER"
    );
  }
  await prisma.classTeacher.deleteMany({
    where: { classId, userId },
  });
  return listClassTeachers(classId);
}

export async function getClassSubmissionsOverview(
  classId: string,
  filters?: { assignmentId?: string; studentId?: string; status?: SubmissionStatus }
) {
  const submissions = await prisma.submission.findMany({
    where: {
      assignment: {
        classId,
        ...(filters?.assignmentId ? { id: filters.assignmentId } : {}),
      },
      ...(filters?.studentId ? { studentId: filters.studentId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    include: {
      student: { select: { id: true, name: true, email: true } },
      assignment: {
        select: {
          id: true,
          title: true,
          dueAt: true,
          scoreScale: true,
        },
      },
    },
    orderBy: [{ submittedAt: "desc" }, { startedAt: "desc" }],
    take: 300,
  });

  return submissions.map((s) => ({
    id: s.id,
    assignmentId: s.assignmentId,
    assignmentTitle: s.assignment.title,
    studentId: s.studentId,
    studentName: s.student.name,
    studentEmail: s.student.email,
    attemptNo: s.attemptNo,
    status: s.status,
    isLate: s.isLate,
    totalScore: s.totalScore,
    maxScore: s.maxScore,
    submittedAt: s.submittedAt?.toISOString() ?? null,
    startedAt: s.startedAt.toISOString(),
  }));
}

function mondayUtcStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export async function getClassAnalytics(classId: string) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      enrollments: {
        where: { status: "ACTIVE", student: { deletedAt: null } },
        include: { student: { select: { id: true, name: true, email: true } } },
      },
      assignments: {
        include: {
          targets: { select: { studentId: true } },
          submissions: {
            select: {
              studentId: true,
              status: true,
              totalScore: true,
              maxScore: true,
              submittedAt: true,
              startedAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }

  const now = new Date();
  const currentWeekStart = mondayUtcStart(now);
  const weekBuckets: Array<{
    weekStart: Date;
    label: string;
    scores: number[];
    submissionCount: number;
  }> = [];

  for (let i = 11; i >= 0; i--) {
    const start = new Date(currentWeekStart);
    start.setUTCDate(start.getUTCDate() - i * 7);
    const dd = String(start.getUTCDate()).padStart(2, "0");
    const mm = String(start.getUTCMonth() + 1).padStart(2, "0");
    weekBuckets.push({
      weekStart: start,
      label: `${dd}/${mm}`,
      scores: [],
      submissionCount: 0,
    });
  }

  const missingCountByStudent = new Map<string, number>();
  for (const enr of cls.enrollments) {
    missingCountByStudent.set(enr.studentId, 0);
  }

  let expectedPairs = 0;
  let completedPairs = 0;
  const allGradedScores10: number[] = [];

  for (const asg of cls.assignments) {
    const targetSet =
      asg.targets.length > 0 ? new Set(asg.targets.map((t) => t.studentId)) : null;
    const eligibleStudents = cls.enrollments.filter(
      (e) => !targetSet || targetSet.has(e.studentId)
    );
    const completedStudents = new Set(
      asg.submissions
        .filter((s) => s.status === "SUBMITTED" || s.status === "GRADED")
        .map((s) => s.studentId)
    );

    expectedPairs += eligibleStudents.length;
    for (const enr of eligibleStudents) {
      if (completedStudents.has(enr.studentId)) {
        completedPairs += 1;
      } else {
        missingCountByStudent.set(
          enr.studentId,
          (missingCountByStudent.get(enr.studentId) ?? 0) + 1
        );
      }
    }

    for (const sub of asg.submissions) {
      if (sub.status !== "SUBMITTED" && sub.status !== "GRADED") continue;
      const stamp = sub.submittedAt ?? sub.startedAt;
      const subWeek = mondayUtcStart(stamp).getTime();
      const bucket = weekBuckets.find((b) => b.weekStart.getTime() === subWeek);
      const scale10 =
        sub.status === "GRADED" && sub.totalScore !== null && sub.maxScore > 0
          ? Math.round((sub.totalScore / sub.maxScore) * 1000) / 100
          : null;
      if (scale10 !== null) {
        allGradedScores10.push(scale10);
      }
      if (bucket) {
        bucket.submissionCount += 1;
        if (scale10 !== null) bucket.scores.push(scale10);
      }
    }
  }

  const weeklyTrend = weekBuckets.map((b) => ({
    weekStart: b.weekStart.toISOString(),
    label: b.label,
    submissionCount: b.submissionCount,
    avgScore10:
      b.scores.length > 0
        ? Math.round((b.scores.reduce((a, v) => a + v, 0) / b.scores.length) * 100) / 100
        : null,
  }));

  const mostUnsubmittedStudents = cls.enrollments
    .map((e) => ({
      studentId: e.studentId,
      studentName: e.student.name,
      studentEmail: e.student.email,
      missingCount: missingCountByStudent.get(e.studentId) ?? 0,
    }))
    .filter((s) => s.missingCount > 0)
    .sort((a, b) => b.missingCount - a.missingCount || a.studentName.localeCompare(b.studentName, "vi"))
    .slice(0, 8);

  const avgClassScore10 =
    allGradedScores10.length > 0
      ? Math.round(
          (allGradedScores10.reduce((a, v) => a + v, 0) / allGradedScores10.length) * 100
        ) / 100
      : 0;
  const submissionRatePct =
    expectedPairs > 0 ? Math.round((completedPairs / expectedPairs) * 1000) / 10 : 0;

  return {
    summary: {
      totalStudents: cls.enrollments.length,
      totalAssignments: cls.assignments.length,
      submissionRatePct,
      avgScore10: avgClassScore10,
    },
    weeklyTrend,
    mostUnsubmittedStudents,
  };
}

/** Clones a class's structure & lesson links into a fresh class with a new joinCode (no students/posts/submissions). */
export async function cloneClass(classId: string, actorId: string, newName: string) {
  const src = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      classLessons: {
        where: { lesson: { deletedAt: null } },
        select: { lessonId: true, order: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!src || src.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }

  const joinCode = await generateUniqueJoinCode();
  const cloned = await prisma.$transaction(async (tx) => {
    const created = await tx.class.create({
      data: {
        name: newName.trim(),
        description: src.description,
        requireApproval: src.requireApproval,
        joinCode,
        teacherId: actorId,
      },
    });
    if (src.classLessons.length > 0) {
      await tx.classLesson.createMany({
        data: src.classLessons.map((cl) => ({
          classId: created.id,
          lessonId: cl.lessonId,
          order: cl.order,
        })),
      });
    }
    return created;
  });

  await logAudit({
    actorId,
    action: "CLASS_CLONED",
    targetType: "CLASS",
    targetId: cloned.id,
    summary: `Nhân bản lớp "${src.name}" thành "${cloned.name}"`,
    summaryEn: `Cloned class "${src.name}" into "${cloned.name}"`,
    meta: { sourceClassId: src.id, clonedClassId: cloned.id },
  });

  return cloned;
}
