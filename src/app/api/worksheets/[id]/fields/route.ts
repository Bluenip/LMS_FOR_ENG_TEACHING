import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfWorksheet } from "@/lib/permissions";
import { saveWorksheetFieldsSchema } from "@/lib/validators";
import { saveWorksheetFields } from "@/server/worksheetService";

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfWorksheet(id);
    const body = await req.json();
    const { fields } = saveWorksheetFieldsSchema.parse(body);
    const saved = await saveWorksheetFields(id, fields);
    return NextResponse.json({ fields: saved, savedAt: new Date().toISOString() });
  } catch (error) {
    return handleApiError(error);
  }
}
