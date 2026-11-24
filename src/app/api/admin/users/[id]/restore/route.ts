import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { restoreAccount } from "@/server/accountService";

/** Admin restores an account from the trash. */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(["ADMIN"]);
    const { id } = await context.params;
    return NextResponse.json(await restoreAccount(actor, id));
  } catch (error) {
    return handleApiError(error);
  }
}
