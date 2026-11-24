import { NextResponse } from "next/server";
import { handleApiError, requireMemberOfClass } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getAssignmentLeaderboard } from "@/server/leaderboardService";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assignmentId } = await context.params;
    const asg = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { classId: true },
    });
    if (!asg) {
      return NextResponse.json({ error: "Không tìm thấy bài tập." }, { status: 404 });
    }
    const { user, isTeacher } = await requireMemberOfClass(asg.classId);
    const url = new URL(req.url);
    const scoreRuleParam = url.searchParams.get("scoreRule");
    const scoreRuleOverride =
      scoreRuleParam === "LAST" || scoreRuleParam === "BEST" ? scoreRuleParam : undefined;

    const leaderboard = await getAssignmentLeaderboard({
      assignmentId,
      viewerId: user.id,
      isTeacher,
      scoreRuleOverride,
    });
    return NextResponse.json({ leaderboard });
  } catch (error) {
    return handleApiError(error);
  }
}
