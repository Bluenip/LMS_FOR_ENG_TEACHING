import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { resetPasswordFor } from "@/server/accountService";

/** Admin: any account. Teacher: students / parents of their classes. Returns a temporary password once. */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(["ADMIN", "TEACHER"]);
    const { id } = await context.params;
    return NextResponse.json(await resetPasswordFor(actor, id));
  } catch (error) {
    return handleApiError(error);
  }
}
