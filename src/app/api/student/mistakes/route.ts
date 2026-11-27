import { NextResponse } from "next/server";
import { isValidSubject } from "@/lib/subjects";
import { SkillTag, type WorksheetSubject } from "@prisma/client";
import { handleApiError, requireRole } from "@/lib/permissions";
import { listReviewableMistakesForStudent } from "@/server/mistakeReviewService";

const VALID_SKILLS = new Set<string>(Object.values(SkillTag));

export async function GET(req: Request) {
  try {
    const user = await requireRole(["STUDENT"]);
    const url = new URL(req.url);
    const subjParam = url.searchParams.get("subject");
    const skillParam = url.searchParams.get("skillTag");
    const limitParam = url.searchParams.get("limit");

    const subject: WorksheetSubject | undefined =
      subjParam && isValidSubject(subjParam) ? subjParam : undefined;
    const skillTag: SkillTag | undefined =
      skillParam && VALID_SKILLS.has(skillParam) ? (skillParam as SkillTag) : undefined;
    const limit = limitParam ? Number(limitParam) : undefined;

    const mistakes = await listReviewableMistakesForStudent(user.id, {
      subject,
      skillTag,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return NextResponse.json({ mistakes });
  } catch (error) {
    return handleApiError(error);
  }
}
