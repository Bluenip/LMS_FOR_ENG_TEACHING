import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { openParentThreadSchema } from "@/lib/validators";
import { listThreadsForUser, openOrCreateParentThread } from "@/server/parentMessageService";

export async function GET() {
  try {
    const user = await requireRole(["TEACHER", "PARENT", "ADMIN"]);
    const data = await listThreadsForUser({ id: user.id, role: user.role });
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "PARENT", "ADMIN"]);
    const body = await req.json();
    const parsed = openParentThreadSchema.parse(body);
    const thread = await openOrCreateParentThread({ id: user.id, role: user.role }, parsed);
    return NextResponse.json({ thread }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
