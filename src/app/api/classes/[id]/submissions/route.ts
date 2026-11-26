import { NextResponse } from "next/server";
import type { SubmissionStatus } from "@prisma/client";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { getClassSubmissionsOverview } from "@/server/classService";

const VALID_STATUSES = new Set(["IN_PROGRESS", "SUBMITTED", "GRADED", "RETURNED"]);

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    const url = new URL(req.url);
    const assignmentId = url.searchParams.get("assignmentId")?.trim() || undefined;
    const studentId = url.searchParams.get("studentId")?.trim() || undefined;
    const rawStatus = url.searchParams.get("status")?.trim();
    const status =
      rawStatus && VALID_STATUSES.has(rawStatus)
        ? (rawStatus as SubmissionStatus)
        : undefined;

    const submissions = await getClassSubmissionsOverview(id, {
      assignmentId,
      studentId,
      status,
    });
    return NextResponse.json({ submissions });
  } catch (error) {
    return handleApiError(error);
  }
}
