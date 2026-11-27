import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { confirmAndSyncOmrToGradebook } from "@/server/omrService";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    return NextResponse.json(await confirmAndSyncOmrToGradebook(id, user));
  } catch (error) {
    return handleApiError(error);
  }
}
