import { NextResponse } from "next/server";
import {
  handleApiError,
  requireStudentForAssignment,
  requireTeacherOfAssignment,
} from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getStudentAssignmentPayload } from "@/server/submissionService";
import {
  updateAssignment,
  verifySebHeaderIfNeeded,
} from "@/server/assignmentService";
import { updateAssignmentSchema } from "@/lib/validators";
import { enqueueDriveTrashByFileIds } from "@/server/driveService";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, assignment } = await requireStudentForAssignment(id);
    verifySebHeaderIfNeeded(assignment, req.headers);

    const url = new URL(req.url);
    const submissionId = url.searchParams.get("submissionId") ?? undefined;
    const payload = await getStudentAssignmentPayload(id, user.id, submissionId);
    return NextResponse.json(payload);
  } catch (error) {
    return handleApiError(error);
  }
}

/** Teacher edits an assignment after it was given (attempts, deadline, timing, proctoring…). */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user } = await requireTeacherOfAssignment(id, "CO_TEACHER");
    const data = updateAssignmentSchema.parse(await req.json());
    const assignment = await updateAssignment(id, data, user.id);
    return NextResponse.json({ assignment });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfAssignment(id, "CO_TEACHER");
    const subFiles = await prisma.driveFile.findMany({
      where: { submission: { assignmentId: id }, trashedAt: null },
      select: { id: true },
    });
    if (subFiles.length > 0) {
      await enqueueDriveTrashByFileIds(
        subFiles.map((f) => f.id),
        "ASSIGNMENT_DELETED"
      );
    }
    await prisma.assignment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
