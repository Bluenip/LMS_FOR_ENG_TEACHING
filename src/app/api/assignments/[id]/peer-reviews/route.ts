import { NextResponse } from "next/server";
import { handleApiError, requireAuth, requireStudentForAssignment, requireTeacherOfAssignment } from "@/lib/permissions";
import { getMyPeerReviews, getReceivedPeerFeedback, listPeerReviewsForTeacher } from "@/server/peerReviewService";

/** Teacher: every pair with names. Student: their anonymous review tasks + feedback received. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireAuth();
    if (user.role === "STUDENT") {
      await requireStudentForAssignment(id);
      const [mine, received] = await Promise.all([getMyPeerReviews(id, user.id), getReceivedPeerFeedback(id, user.id)]);
      return NextResponse.json({ ...mine, received });
    }
    await requireTeacherOfAssignment(id);
    return NextResponse.json({ reviews: await listPeerReviewsForTeacher(id) });
  } catch (error) {
    return handleApiError(error);
  }
}
