import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { createAccountSchema } from "@/lib/validators";
import { createAccount } from "@/server/accountService";

/** Admin creates an account of any role (public registration is disabled). */
export async function POST(req: Request) {
  try {
    const actor = await requireRole(["ADMIN"]);
    const data = createAccountSchema.parse(await req.json());
    const result = await createAccount(actor, data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
