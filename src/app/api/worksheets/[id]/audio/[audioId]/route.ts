import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfWorksheet } from "@/lib/permissions";
import { updateWorksheetAudioSchema } from "@/lib/validators";
import {
  deleteWorksheetAudio,
  updateWorksheetAudio,
} from "@/server/worksheetAudioService";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; audioId: string }> }
) {
  try {
    const { id, audioId } = await context.params;
    await requireTeacherOfWorksheet(id);
    const body = await req.json();
    const data = updateWorksheetAudioSchema.parse(body);
    const audio = await updateWorksheetAudio(id, audioId, data);
    return NextResponse.json({ audio });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; audioId: string }> }
) {
  try {
    const { id, audioId } = await context.params;
    await requireTeacherOfWorksheet(id);
    await deleteWorksheetAudio(id, audioId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
