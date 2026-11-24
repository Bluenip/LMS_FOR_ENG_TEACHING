import { NextResponse } from "next/server";
import { handleApiError, requireMemberOfClass } from "@/lib/permissions";
import {
  getAssignmentLeaderboard,
  getClassSemesterLeaderboard,
} from "@/server/leaderboardService";
import { prisma } from "@/lib/db";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: classId } = await context.params;
    const { user, isTeacher } = await requireMemberOfClass(classId);
    const url = new URL(req.url);
    const assignmentId = url.searchParams.get("assignmentId");
    const includeMissingAsZero = url.searchParams.get("missingZero") !== "false";
    const scoreRuleParam = url.searchParams.get("scoreRule");
    const scoreRuleOverride =
      scoreRuleParam === "LAST" || scoreRuleParam === "BEST" ? scoreRuleParam : undefined;

    const assignments = await prisma.assignment.findMany({
      where: { classId },
      select: {
        id: true,
        title: true,
        dueAt: true,
        showLeaderboard: true,
        leaderboardAnon: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (assignmentId) {
      const belongs = assignments.some((a) => a.id === assignmentId);
      if (!belongs) {
        return NextResponse.json(
          { error: "Bài tập không thuộc lớp này." },
          { status: 404 }
        );
      }
      const leaderboard = await getAssignmentLeaderboard({
        assignmentId,
        viewerId: user.id,
        isTeacher,
        scoreRuleOverride,
      });
      return NextResponse.json({ leaderboard, assignments });
    }

    const leaderboard = await getClassSemesterLeaderboard({
      classId,
      viewerId: user.id,
      isTeacher,
      includeMissingAsZero,
    });
    return NextResponse.json({ leaderboard, assignments });
  } catch (error) {
    return handleApiError(error);
  }
}
