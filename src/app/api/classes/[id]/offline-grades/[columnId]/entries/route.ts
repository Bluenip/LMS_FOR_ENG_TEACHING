import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { saveOfflineGradeEntriesSchema } from "@/lib/validators";
import { saveOfflineGradeEntries } from "@/server/offlineGradeService";

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string; columnId: string }> }
) {
  try {
    const { id, columnId } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    const data = saveOfflineGradeEntriesSchema.parse(await req.json());
    const entries = await saveOfflineGradeEntries(id, columnId, data.entries);
    return NextResponse.json({ entries });
  } catch (error) {
    return handleApiError(error);
  }
}
