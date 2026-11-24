import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { requestAudioPlay } from "@/server/worksheetAudioService";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string; audioId: string }> }
) {
  try {
    const user = await requireRole(["STUDENT"]);
    const { id, audioId } = await context.params;
    const result = await requestAudioPlay(id, audioId, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
