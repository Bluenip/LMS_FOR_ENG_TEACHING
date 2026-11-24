import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, handleApiError, requireAuth } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import {
  createParentInviteCodeForStudent,
  listStudentParentCodes,
} from "@/server/parentService";

const createCodeBody = z.object({
  studentId: z.string().optional(),
});

export async function GET() {
  try {
    const user = await requireAuth();
    if (user.role !== "STUDENT") {
      throw new AppError("Chỉ học sinh xem được danh sách mã liên kết của mình.", 403, "FORBIDDEN");
    }
    const codes = await listStudentParentCodes(user.id);
    return NextResponse.json({ codes });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const raw = await req.json().catch(() => ({}));
    const body = createCodeBody.parse(raw);

    let targetStudentId = user.id;
    if (user.role === "STUDENT") {
      targetStudentId = user.id;
    } else if (user.role === "TEACHER" || user.role === "ADMIN") {
      if (!body.studentId) {
        throw new AppError("Thiếu studentId.", 400, "MISSING_STUDENT_ID");
      }
      if (user.role === "TEACHER") {
        // Teacher may only create invite code for students enrolled in their own classes
        const enrolled = await prisma.enrollment.findFirst({
          where: {
            studentId: body.studentId,
            status: "ACTIVE",
            class: { teacherId: user.id },
          },
          select: { id: true },
        });
        if (!enrolled) {
          throw new AppError("Học sinh không thuộc lớp của bạn.", 403, "FORBIDDEN");
        }
      }
      targetStudentId = body.studentId;
    } else {
      throw new AppError("Bạn không có quyền tạo mã liên kết phụ huynh.", 403, "FORBIDDEN");
    }

    const invite = await createParentInviteCodeForStudent(targetStudentId);
    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
