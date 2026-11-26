import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { createOfflineGradeColumnSchema } from "@/lib/validators";
import {
  createOfflineGradeColumn,
  listOfflineGradeColumns,
} from "@/server/offlineGradeService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    const columns = await listOfflineGradeColumns(id);
    return NextResponse.json({ columns });
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
    const { user } = await requireTeacherOfClass(id, "CO_TEACHER");
    const data = createOfflineGradeColumnSchema.parse(await req.json());
    const column = await createOfflineGradeColumn(id, user.id, data);
    return NextResponse.json({ column }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
