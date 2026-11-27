import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { toggleWorksheetLike } from "@/server/discoverService";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    const result = await toggleWorksheetLike(id, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
