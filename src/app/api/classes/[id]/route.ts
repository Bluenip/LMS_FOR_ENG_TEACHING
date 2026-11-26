import { NextResponse } from "next/server";
import {
  AppError,
  handleApiError,
  hasMinClassRole,
  requireMemberOfClass,
  requireTeacherOfClass,
} from "@/lib/permissions";
import { updateClassSchema } from "@/lib/validators";
import { getClassDetail, updateClass } from "@/server/classService";
import { trashClass } from "@/server/trashService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, isTeacher, classRole } = await requireMemberOfClass(id);
    const cls = await getClassDetail(id, isTeacher ? undefined : { studentId: user.id });

    // Strip pending enrollments & student emails for student viewers
    const response = isTeacher
      ? cls
      : {
          ...cls,
          enrollments: cls.enrollments
            .filter((e) => e.status === "ACTIVE")
            .map((e) => ({
              id: e.id,
              status: e.status,
              joinedAt: e.joinedAt,
              student: { id: e.student.id, name: e.student.name },
            })),
        };

    return NextResponse.json({ class: response, isTeacher, classRole });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, classRole } = await requireTeacherOfClass(id, "CO_TEACHER");
    const body = await req.json();
    const data = updateClassSchema.parse(body);
    if (data.archived !== undefined && !hasMinClassRole(classRole, "OWNER")) {
      throw new AppError(
        "Chỉ chủ sở hữu lớp hoặc quản trị viên mới thực hiện được thao tác này.",
        403,
        "FORBIDDEN"
      );
    }
    const updated = await updateClass(id, data, user.id);
    return NextResponse.json({ class: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user } = await requireTeacherOfClass(id, "OWNER");
    // moves the class to the trash (restorable for 30 days from Library › Trash)
    await trashClass(user, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
