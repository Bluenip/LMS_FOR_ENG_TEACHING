import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { liveQuizExportGradeSchema } from "@/lib/validators";
import { exportLiveQuizToOfflineGrade } from "@/server/liveQuizService";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = liveQuizExportGradeSchema.parse(await req.json());
    return NextResponse.json(await exportLiveQuizToOfflineGrade(id, user, data));
  } catch (error) {
    return handleApiError(error);
  }
}
