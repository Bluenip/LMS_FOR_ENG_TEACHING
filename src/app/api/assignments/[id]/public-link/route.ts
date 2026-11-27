import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfAssignment } from "@/lib/permissions";
import { togglePublicPracticeSchema } from "@/lib/validators";
import {
  listPublicPracticeAttempts,
  toggleAssignmentPublicPractice,
} from "@/server/publicPracticeService";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfAssignment(id);
    const [assignment, stats] = await Promise.all([
      prisma.assignment.findUnique({
        where: { id },
        select: { id: true, allowPublicPractice: true, publicShareToken: true },
      }),
      listPublicPracticeAttempts(id),
    ]);
    return NextResponse.json({ assignment, ...stats });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfAssignment(id);
    const data = togglePublicPracticeSchema.parse(await req.json());
    const assignment = await toggleAssignmentPublicPractice(id, data.enabled);
    return NextResponse.json({ assignment });
  } catch (error) {
    return handleApiError(error);
  }
}
