import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { updateOfflineGradeColumnSchema } from "@/lib/validators";
import {
  deleteOfflineGradeColumn,
  updateOfflineGradeColumn,
} from "@/server/offlineGradeService";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; columnId: string }> }
) {
  try {
    const { id, columnId } = await context.params;
    await requireTeacherOfClass(id, "CO_TEACHER");
    const data = updateOfflineGradeColumnSchema.parse(await req.json());
    const column = await updateOfflineGradeColumn(id, columnId, data);
    return NextResponse.json({ column });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; columnId: string }> }
) {
  try {
    const { id, columnId } = await context.params;
    await requireTeacherOfClass(id, "CO_TEACHER");
    await deleteOfflineGradeColumn(id, columnId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
