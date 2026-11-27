import { NextResponse } from "next/server";
import type { WorksheetSubject } from "@prisma/client";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { WORKSHEET_SUBJECTS } from "@/lib/subjects";
import { getClassMasteryMatrix } from "@/server/masteryAnalyticsService";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    const sp = new URL(req.url).searchParams;
    const subject = sp.get("subject");
    const matrix = await getClassMasteryMatrix(id, {
      from: sp.get("from"),
      to: sp.get("to"),
      subject: subject && (WORKSHEET_SUBJECTS as readonly string[]).includes(subject) ? (subject as WorksheetSubject) : null,
    });
    return NextResponse.json(matrix);
  } catch (error) {
    return handleApiError(error);
  }
}
