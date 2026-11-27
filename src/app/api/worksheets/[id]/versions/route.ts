import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfWorksheet } from "@/lib/permissions";
import { createWorksheetVersionSchema } from "@/lib/validators";
import { createWorksheetSnapshot, listWorksheetVersions } from "@/server/worksheetVersionService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfWorksheet(id);
    const data = await listWorksheetVersions(id);
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
    const { user } = await requireTeacherOfWorksheet(id);
    const body = await req.json().catch(() => ({}));
    const data = createWorksheetVersionSchema.parse(body);
    const version = await createWorksheetSnapshot(id, user.id, data.note ?? null);
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
