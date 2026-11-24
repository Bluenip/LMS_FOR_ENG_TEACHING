import { NextResponse } from "next/server";
import { handleApiError, requireAuth, requireRole } from "@/lib/permissions";
import { createAssignmentSchema } from "@/lib/validators";
import {
  createAssignmentsForClasses,
  listStudentAssignments,
  listTeacherAssignments,
} from "@/server/assignmentService";

export async function GET() {
  try {
    const user = await requireAuth();
    if (user.role === "TEACHER" || user.role === "ADMIN") {
      const assignments = await listTeacherAssignments(user.id);
      return NextResponse.json({ assignments });
    }
    if (user.role === "STUDENT") {
      const assignments = await listStudentAssignments(user.id);
      return NextResponse.json({ assignments });
    }
    return NextResponse.json({ assignments: [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const body = await req.json();
    const data = createAssignmentSchema.parse(body);
    const assignments = await createAssignmentsForClasses(
      user.id,
      user.role === "ADMIN",
      data
    );
    return NextResponse.json({ assignments }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
