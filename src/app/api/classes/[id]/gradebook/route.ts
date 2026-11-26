import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { getRequestLocale } from "@/lib/i18n/server";
import {
  exportClassGradebookExcel,
  getClassGradebook,
} from "@/server/gradebookService";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "json";
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;

    if (format === "xlsx") {
      const locale = await getRequestLocale();
      const { buffer, filename } = await exportClassGradebookExcel(id, { from, to }, locale);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const gradebook = await getClassGradebook(id, { from, to });
    return NextResponse.json(gradebook);
  } catch (error) {
    return handleApiError(error);
  }
}
