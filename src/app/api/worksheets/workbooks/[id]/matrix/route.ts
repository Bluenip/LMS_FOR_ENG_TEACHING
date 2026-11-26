import { NextResponse } from "next/server";
import { getRequestLocale } from "@/lib/i18n/server";
import { AppError, handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { exportWorkbookMatrixXlsx, getWorkbookMatrix } from "@/server/workbookService";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workbookId } = await context.params;
    const url = new URL(req.url);
    const classId = url.searchParams.get("classId")?.trim();
    if (!classId) {
      throw new AppError("Vui lòng chọn lớp học", 400, "VALIDATION_ERROR");
    }
    await requireTeacherOfClass(classId, "ASSISTANT");

    if (url.searchParams.get("export") === "xlsx") {
      const locale = await getRequestLocale();
      const { buffer, filename } = await exportWorkbookMatrixXlsx(
        workbookId,
        classId,
        locale
      );
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        },
      });
    }

    const matrix = await getWorkbookMatrix(workbookId, classId);
    return NextResponse.json({ matrix });
  } catch (error) {
    return handleApiError(error);
  }
}
