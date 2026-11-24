import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { getDeletionImpact } from "@/server/accountService";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["ADMIN"]);
    const { id } = await context.params;
    return NextResponse.json({ user: await getDeletionImpact(id) });
  } catch (error) {
    return handleApiError(error);
  }
}
