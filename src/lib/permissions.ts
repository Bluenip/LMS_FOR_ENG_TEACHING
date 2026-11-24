import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getRequestLocale } from "@/lib/i18n/server";
import { localizeApiError } from "@/lib/i18n/api-errors";
import { getHomeForRole } from "@/lib/utils";

export { AppError };

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface LayoutUser extends SessionUser {
  avatarUrl: string | null;
}

/** A session issued before the last password change/reset is no longer valid (signs out other devices). */
function isSessionOlderThanPasswordChange(
  issuedAtSec: number | undefined,
  passwordChangedAt: Date | null
): boolean {
  if (!passwordChangedAt || !issuedAtSec) return false;
  return issuedAtSec * 1000 < passwordChangedAt.getTime() - 2000;
}

/**
 * Validates the current NextAuth session against the database for Server Component layouts/pages.
 * Redirects stale/deleted or locked accounts through /api/auth/clear-session so cookies are cleared
 * before landing on /login?reason=...
 */
export async function requireLayoutUser(
  allowedRoles?: Role[],
  opts?: { allowPendingPasswordChange?: boolean }
): Promise<LayoutUser> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isLocked: true,
      avatarUrl: true,
      mustChangePassword: true,
      passwordChangedAt: true,
    },
  });

  if (!dbUser) {
    redirect("/api/auth/clear-session?reason=session");
  }
  if (dbUser.isLocked) {
    redirect("/api/auth/clear-session?reason=locked");
  }
  if (isSessionOlderThanPasswordChange(session.user.issuedAt, dbUser.passwordChangedAt)) {
    redirect("/api/auth/clear-session?reason=session");
  }
  if (dbUser.mustChangePassword && !opts?.allowPendingPasswordChange) {
    redirect("/account?force=1");
  }
  if (allowedRoles && !allowedRoles.includes(dbUser.role)) {
    redirect(getHomeForRole(dbUser.role));
  }

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    avatarUrl: dbUser.avatarUrl,
  };
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    throw new AppError("Vui lòng đăng nhập để tiếp tục.", 401, "UNAUTHORIZED");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true, isLocked: true, passwordChangedAt: true },
  });

  if (!dbUser) {
    throw new AppError("Tài khoản không tồn tại.", 401, "UNAUTHORIZED");
  }
  if (dbUser.isLocked) {
    throw new AppError("Tài khoản của bạn đã bị khoá.", 403, "ACCOUNT_LOCKED");
  }
  if (isSessionOlderThanPasswordChange(session.user.issuedAt, dbUser.passwordChangedAt)) {
    throw new AppError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401, "UNAUTHORIZED");
  }

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
  };
}

export async function requireRole(allowedRoles: Role[]): Promise<SessionUser> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new AppError("Bạn không có quyền truy cập chức năng này.", 403, "FORBIDDEN");
  }
  return user;
}

export async function requireTeacherOfClass(classId: string) {
  const user = await requireRole(["TEACHER", "ADMIN"]);
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }
  if (user.role !== "ADMIN" && cls.teacherId !== user.id) {
    throw new AppError("Bạn không có quyền quản lý lớp học này.", 403, "FORBIDDEN");
  }
  return { user, cls };
}

export async function requireStudentInClass(classId: string) {
  const user = await requireRole(["STUDENT"]);
  const enrollment = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId, studentId: user.id } },
    include: { class: true },
  });
  if (!enrollment || enrollment.status !== "ACTIVE") {
    throw new AppError("Bạn chưa tham gia lớp học này.", 403, "FORBIDDEN");
  }
  return { user, enrollment, cls: enrollment.class };
}

export async function requireMemberOfClass(classId: string) {
  const user = await requireAuth();
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }
  if (user.role === "ADMIN" || cls.teacherId === user.id) {
    return { user, cls, isTeacher: true };
  }
  if (user.role === "STUDENT") {
    const enrollment = await prisma.enrollment.findUnique({
      where: { classId_studentId: { classId, studentId: user.id } },
    });
    if (enrollment && enrollment.status === "ACTIVE") {
      return { user, cls, isTeacher: false };
    }
  }
  throw new AppError("Bạn không có quyền truy cập lớp học này.", 403, "FORBIDDEN");
}

export async function requireParentOf(studentId: string) {
  const user = await requireRole(["PARENT"]);
  const link = await prisma.parentLink.findUnique({
    where: { parentId_studentId: { parentId: user.id, studentId } },
    include: {
      student: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
    },
  });
  if (!link || !link.verifiedAt) {
    throw new AppError(
      "Bạn không có quyền xem thông tin học sinh này.",
      403,
      "FORBIDDEN"
    );
  }
  return { user, link, student: link.student };
}

export async function requireTeacherOfWorksheet(worksheetId: string) {
  const user = await requireRole(["TEACHER", "ADMIN"]);
  const worksheet = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
  });
  if (!worksheet) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }
  if (user.role !== "ADMIN" && worksheet.ownerId !== user.id) {
    throw new AppError("Bạn không có quyền chỉnh sửa phiếu bài tập này.", 403, "FORBIDDEN");
  }
  return { user, worksheet };
}

export async function requireTeacherOfAssignment(assignmentId: string) {
  const user = await requireRole(["TEACHER", "ADMIN"]);
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { class: true, worksheet: true },
  });
  if (!assignment) {
    throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  }
  if (user.role !== "ADMIN" && assignment.class.teacherId !== user.id) {
    throw new AppError("Bạn không có quyền quản lý bài tập này.", 403, "FORBIDDEN");
  }
  return { user, assignment };
}

export async function requireStudentForAssignment(assignmentId: string) {
  const user = await requireRole(["STUDENT"]);
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { class: true },
  });
  if (!assignment) {
    throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  }
  const enrollment = await prisma.enrollment.findUnique({
    where: {
      classId_studentId: { classId: assignment.classId, studentId: user.id },
    },
  });
  if (!enrollment || enrollment.status !== "ACTIVE") {
    throw new AppError("Bạn không thuộc lớp được giao bài tập này.", 403, "FORBIDDEN");
  }
  return { user, assignment };
}

export async function requireSubmissionAccess(submissionId: string) {
  const user = await requireAuth();
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: {
        include: { class: true },
      },
    },
  });
  if (!submission) {
    throw new AppError("Không tìm thấy bài làm.", 404, "NOT_FOUND");
  }
  const isOwnerStudent = user.role === "STUDENT" && submission.studentId === user.id;
  const isTeacher =
    user.role === "ADMIN" ||
    (user.role === "TEACHER" && submission.assignment.class.teacherId === user.id);

  let isParent = false;
  if (user.role === "PARENT") {
    const link = await prisma.parentLink.findUnique({
      where: { parentId_studentId: { parentId: user.id, studentId: submission.studentId } },
    });
    if (link?.verifiedAt) {
      isParent = true;
    }
  }

  if (!isOwnerStudent && !isTeacher && !isParent) {
    throw new AppError("Bạn không có quyền truy cập bài làm này.", 403, "FORBIDDEN");
  }

  return { user, submission, isTeacher, isParent, isOwnerStudent };
}

export async function handleApiError(error: unknown): Promise<NextResponse> {
  const locale = await getRequestLocale();

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: localizeApiError(error.message, error.code, locale),
        code: error.code,
        ...(error.params ? { params: error.params } : {}),
      },
      { status: error.statusCode }
    );
  }
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const rawMsg = firstIssue?.message ?? "Dữ liệu đầu vào không hợp lệ.";
    return NextResponse.json(
      {
        error: localizeApiError(rawMsg, "VALIDATION_ERROR", locale),
        code: "VALIDATION_ERROR",
        issues: error.issues,
      },
      { status: 400 }
    );
  }
  console.error("[API Error]", error);
  return NextResponse.json(
    {
      error: localizeApiError(
        "Đã có lỗi máy chủ. Vui lòng thử lại sau.",
        "INTERNAL_ERROR",
        locale
      ),
      code: "INTERNAL_ERROR",
    },
    { status: 500 }
  );
}
