import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { markLessonItemViewed } from "@/server/lessonProgressService";

export async function POST(
  _req: Request,
  context: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await context.params;
    const user = await requireRole(["STUDENT"]);
    const progress = await markLessonItemViewed(itemId, user.id);
    return NextResponse.json({
      progress: {
        lessonItemId: progress.lessonItemId,
        completedAt: progress.completedAt.toISOString(),
        viewCount: progress.viewCount,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
