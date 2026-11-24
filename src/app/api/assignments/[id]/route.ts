import { NextResponse } from "next/server";
import {
  handleApiError,
  requireStudentForAssignment,
  requireTeacherOfAssignment,
} from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getStudentAssignmentPayload } from "@/server/submissionService";
import { verifySebHeaderIfNeeded } from "@/server/assignmentService";

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

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfAssignment(id);
    await prisma.assignment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
