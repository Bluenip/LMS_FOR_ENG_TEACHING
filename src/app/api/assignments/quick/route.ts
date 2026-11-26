import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { quickTextbookAssignmentSchema } from "@/lib/validators";
import { createQuickTextbookAssignment } from "@/server/assignmentService";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = quickTextbookAssignmentSchema.parse(await req.json());
    const result = await createQuickTextbookAssignment(user.id, user.role === "ADMIN", data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
