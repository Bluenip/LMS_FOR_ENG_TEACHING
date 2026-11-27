import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { getTeacherPublicProfile } from "@/server/discoverService";

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
    const data = await getTeacherPublicProfile(id, viewerId);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
