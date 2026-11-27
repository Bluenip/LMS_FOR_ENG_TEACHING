import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { createExamSessionSchema } from "@/lib/validators";
import { createExamSession, listExamSessions } from "@/server/examSessionService";

export async function GET() {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const sessions = await listExamSessions(user.id, user.role === "ADMIN");
    return NextResponse.json({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = createExamSessionSchema.parse(await req.json());
    const result = await createExamSession(user.id, user.role === "ADMIN", data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
