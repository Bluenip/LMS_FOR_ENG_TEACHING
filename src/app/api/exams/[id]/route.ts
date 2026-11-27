import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { getRequestLocale } from "@/lib/i18n/server";
import { getExamSessionReport } from "@/server/examSessionService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const locale = await getRequestLocale();
    const report = await getExamSessionReport(id, user.id, user.role === "ADMIN", locale);
    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error);
  }
}
