import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfWorksheet } from "@/lib/permissions";
import { updateWorksheetSchema } from "@/lib/validators";
import {
  deleteWorksheet,
  getWorksheetForTeacher,
  updateWorksheet,
} from "@/server/worksheetService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfWorksheet(id);
    const worksheet = await getWorksheetForTeacher(id);
    return NextResponse.json({ worksheet });
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
    await requireTeacherOfWorksheet(id);
    const body = await req.json();
    const data = updateWorksheetSchema.parse(body);
    const worksheet = await updateWorksheet(id, data);
    return NextResponse.json({ worksheet });
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
    const { user } = await requireTeacherOfWorksheet(id);
    await deleteWorksheet(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
