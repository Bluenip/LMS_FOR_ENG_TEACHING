import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfAssignment } from "@/lib/permissions";
import { getRequestLocale } from "@/lib/i18n/server";
import { generateAssignmentGradebookExcel } from "@/server/reportService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfAssignment(id);
    const locale = await getRequestLocale();
    const { buffer, filename } = await generateAssignmentGradebookExcel(id, locale);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
