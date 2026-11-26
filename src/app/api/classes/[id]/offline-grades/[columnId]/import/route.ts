import { NextResponse } from "next/server";
import { AppError, handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { importOfflineGradesFromExcel } from "@/server/offlineGradeService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; columnId: string }> }
) {
  try {
    const { id, columnId } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    const url = new URL(req.url);
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError(
        "Vui lòng tải file Excel (.xlsx) lên để nhập điểm.",
        400,
        "NO_FILE"
      );
    }
    const isPreview =
      url.searchParams.get("preview") === "1" || formData.get("preview") === "true";
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importOfflineGradesFromExcel(id, columnId, buffer, {
      commit: !isPreview,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
