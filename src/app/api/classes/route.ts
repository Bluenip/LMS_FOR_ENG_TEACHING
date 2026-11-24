import { NextResponse } from "next/server";
import { handleApiError, requireAuth, requireRole } from "@/lib/permissions";
import { createClassSchema } from "@/lib/validators";
import {
  createClass,
  listStudentClasses,
  listTeacherClasses,
} from "@/server/classService";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const includeArchived = url.searchParams.get("includeArchived") === "true";

    if (user.role === "TEACHER" || user.role === "ADMIN") {
      const classes = await listTeacherClasses(user.id, includeArchived);
      return NextResponse.json({ classes });
    }
    if (user.role === "STUDENT") {
      const classes = await listStudentClasses(user.id);
      return NextResponse.json({ classes });
    }
    return NextResponse.json({ classes: [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const body = await req.json();
    const data = createClassSchema.parse(body);
    const cls = await createClass(user.id, data);
    return NextResponse.json({ class: cls }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
