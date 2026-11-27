import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfAssignment } from "@/lib/permissions";
import { generatePeerReviewPairs } from "@/server/peerReviewService";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireTeacherOfAssignment(id, "CO_TEACHER");
    return NextResponse.json(await generatePeerReviewPairs(id));
  } catch (error) {
    return handleApiError(error);
  }
}
