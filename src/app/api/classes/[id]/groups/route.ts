import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { classGroupSchema, updateClassGroupSchema } from "@/lib/validators";
import { createClassGroup, deleteClassGroup, listClassGroups, updateClassGroup } from "@/server/classGroupService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    return NextResponse.json({ groups: await listClassGroups(id) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "CO_TEACHER");
    const data = classGroupSchema.parse(await req.json());
    return NextResponse.json({ group: await createClassGroup(id, data) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "CO_TEACHER");
    const { groupId, ...rest } = updateClassGroupSchema.parse(await req.json());
    return NextResponse.json({ group: await updateClassGroup(id, groupId, rest) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "CO_TEACHER");
    const groupId = new URL(req.url).searchParams.get("groupId");
    if (!groupId) throw new AppError("Không tìm thấy nhóm.", 404, "NOT_FOUND");
    return NextResponse.json(await deleteClassGroup(id, groupId));
  } catch (error) {
    return handleApiError(error);
  }
}
