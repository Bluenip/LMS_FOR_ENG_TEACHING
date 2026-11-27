import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { getDiscoverWorksheetDetail } from "@/server/discoverService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    let viewerId: string | null = null;
    try {
      viewerId = (await requireAuth()).id;
    } catch {
      viewerId = null;
    }
    const { id } = await context.params;
    const worksheet = await getDiscoverWorksheetDetail(id, viewerId);
    return NextResponse.json({ worksheet });
  } catch (error) {
    return handleApiError(error);
  }
}
