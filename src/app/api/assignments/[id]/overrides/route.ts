import { NextResponse } from "next/server";
import { AppError, handleApiError, requireTeacherOfAssignment } from "@/lib/permissions";
import { upsertAssignmentOverrideSchema } from "@/lib/validators";
import {
  deleteAssignmentOverride,
  listAssignmentOverrides,
  upsertAssignmentOverride,
} from "@/server/assignmentOverrideService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfAssignment(id, "ASSISTANT");
    const overrides = await listAssignmentOverrides(id);
    return NextResponse.json({ overrides });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user } = await requireTeacherOfAssignment(id, "CO_TEACHER");
    const data = upsertAssignmentOverrideSchema.parse(await req.json());
    const override = await upsertAssignmentOverride(id, data, user.id);
    return NextResponse.json({ override });
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
    const { user } = await requireTeacherOfAssignment(id, "CO_TEACHER");
    const url = new URL(req.url);
    const studentId = url.searchParams.get("studentId")?.trim();
    if (!studentId) {
      throw new AppError("Thiếu studentId.", 400, "VALIDATION_ERROR");
    }
    const result = await deleteAssignmentOverride(id, studentId, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
