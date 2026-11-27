import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { peerReviewSubmitSchema } from "@/lib/validators";
import { submitPeerReview } from "@/server/peerReviewService";

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["STUDENT"]);
    const data = peerReviewSubmitSchema.parse(await req.json());
    return NextResponse.json(await submitPeerReview(id, user.id, data));
  } catch (error) {
    return handleApiError(error);
  }
}
