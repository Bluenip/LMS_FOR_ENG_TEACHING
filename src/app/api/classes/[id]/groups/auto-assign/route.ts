import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { autoAssignGroupsSchema } from "@/lib/validators";
import { autoAssignClassGroups } from "@/server/classGroupService";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "CO_TEACHER");
    const data = autoAssignGroupsSchema.parse(await req.json());
    return NextResponse.json({ groups: await autoAssignClassGroups(id, data) });
  } catch (error) {
    return handleApiError(error);
  }
}
