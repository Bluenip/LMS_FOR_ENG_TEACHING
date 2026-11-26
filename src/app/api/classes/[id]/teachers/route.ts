import { NextResponse } from "next/server";
import { AppError, handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import {
  manageClassTeacherSchema,
  updateClassTeacherRoleSchema,
} from "@/lib/validators";
import {
  listClassTeachers,
  manageClassTeachers,
  removeClassTeacher,
  updateClassTeacherRole,
} from "@/server/classService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    const data = await listClassTeachers(id);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "OWNER");
    const data = manageClassTeacherSchema.parse(await req.json());
    const result = await manageClassTeachers(id, data);
    return NextResponse.json(result, { status: 201 });
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
    await requireTeacherOfClass(id, "OWNER");
    const data = updateClassTeacherRoleSchema.parse(await req.json());
    const result = await updateClassTeacherRole(id, data.userId, data.role);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "OWNER");
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId")?.trim();
    if (!userId) {
      throw new AppError("Dữ liệu đầu vào không hợp lệ.", 400, "VALIDATION_ERROR");
    }
    const result = await removeClassTeacher(id, userId);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
