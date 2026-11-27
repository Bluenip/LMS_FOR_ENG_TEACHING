import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { sendParentMessageSchema } from "@/lib/validators";
import {
  getParentThreadMessages,
  markParentThreadRead,
  sendParentThreadMessage,
} from "@/server/parentMessageService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ threadId: string }> }
) {
  try {
    const user = await requireRole(["TEACHER", "PARENT", "ADMIN"]);
    const { threadId } = await context.params;
    const data = await getParentThreadMessages({ id: user.id, role: user.role }, threadId);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ threadId: string }> }
) {
  try {
    const user = await requireRole(["TEACHER", "PARENT", "ADMIN"]);
    const { threadId } = await context.params;
    const body = await req.json();
    const parsed = sendParentMessageSchema.parse(body);
    const message = await sendParentThreadMessage(
      { id: user.id, role: user.role },
      threadId,
      parsed.content
    );
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  _req: Request,
  context: { params: Promise<{ threadId: string }> }
) {
  try {
    const user = await requireRole(["TEACHER", "PARENT", "ADMIN"]);
    const { threadId } = await context.params;
    const res = await markParentThreadRead({ id: user.id, role: user.role }, threadId);
    return NextResponse.json(res);
  } catch (error) {
    return handleApiError(error);
  }
}
