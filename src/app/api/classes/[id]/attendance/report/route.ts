import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { getMonthlyAttendanceReport } from "@/server/attendanceService";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    const url = new URL(req.url);
    const now = new Date();
    const rawYear = Number(url.searchParams.get("year") || now.getFullYear());
    const rawMonth = Number(url.searchParams.get("month") || now.getMonth() + 1);

    const year =
      Number.isInteger(rawYear) && rawYear >= 2020 && rawYear <= 2100
        ? rawYear
        : now.getFullYear();
    const month =
      Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12
        ? rawMonth
        : now.getMonth() + 1;

    const report = await getMonthlyAttendanceReport(id, year, month);
    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error);
  }
}
