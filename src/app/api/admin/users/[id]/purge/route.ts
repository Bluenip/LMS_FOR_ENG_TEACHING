import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { deleteAccountSchema } from "@/lib/validators";
import { purgeAccount } from "@/server/accountService";

/** Admin permanently deletes an account that is already in the trash (cannot be undone). */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(["ADMIN"]);
    const { id } = await context.params;
    const { confirmEmail } = deleteAccountSchema.parse(await req.json());
    return NextResponse.json(await purgeAccount(actor, id, confirmEmail));
  } catch (error) {
    return handleApiError(error);
  }
}
