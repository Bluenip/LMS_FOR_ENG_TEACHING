import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { getRequestLocale } from "@/lib/i18n/server";
import {
  exportStudentReportCardPdf,
  getStudentGradebookDetail,
} from "@/server/gradebookService";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; studentId: string }> }
) {
  try {
    const { id, studentId } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "json";
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;

    if (format === "pdf") {
      const locale = await getRequestLocale();
      const { buffer, filename } = await exportStudentReportCardPdf(
        id,
        studentId,
        { from, to },
        locale
      );
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const detail = await getStudentGradebookDetail(id, studentId, { from, to });
    return NextResponse.json(detail);
  } catch (error) {
    return handleApiError(error);
  }
}
