import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { createLiveQuizSchema } from "@/lib/validators";
import {
  createExitTicketSession,
  createLiveQuizFromWorksheet,
  listLiveQuizSessions,
} from "@/server/liveQuizService";

export async function GET(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const classId = new URL(req.url).searchParams.get("classId");
    const sessions = await listLiveQuizSessions(user, { classId });
    return NextResponse.json({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = createLiveQuizSchema.parse(await req.json());
    const created =
      data.kind === "WORKSHEET"
        ? await createLiveQuizFromWorksheet(user, data)
        : await createExitTicketSession(user, data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
