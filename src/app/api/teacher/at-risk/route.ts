import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { getTeacherAtRiskSummary } from "@/server/masteryAnalyticsService";

export async function GET() {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    return NextResponse.json(await getTeacherAtRiskSummary(user));
  } catch (error) {
    return handleApiError(error);
  }
}
