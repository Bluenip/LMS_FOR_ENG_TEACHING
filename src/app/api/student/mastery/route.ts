import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { getStudentMasteryProfile } from "@/server/masteryAnalyticsService";

export async function GET() {
  try {
    const user = await requireRole(["STUDENT"]);
    return NextResponse.json(await getStudentMasteryProfile(user.id, user));
  } catch (error) {
    return handleApiError(error);
  }
}
