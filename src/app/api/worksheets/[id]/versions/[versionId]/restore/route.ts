import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfWorksheet } from "@/lib/permissions";
import { restoreWorksheetVersion } from "@/server/worksheetVersionService";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await context.params;
    const { user } = await requireTeacherOfWorksheet(id);
    const result = await restoreWorksheetVersion(id, versionId, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
