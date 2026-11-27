import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { getStudentMasteryProfile } from "@/server/masteryAnalyticsService";

export async function GET(_req: Request, context: { params: Promise<{ studentId: string }> }) {
  try {
    const { studentId } = await context.params;
    const user = await requireRole(["PARENT"]);
    return NextResponse.json(await getStudentMasteryProfile(studentId, user));
  } catch (error) {
    return handleApiError(error);
  }
}
