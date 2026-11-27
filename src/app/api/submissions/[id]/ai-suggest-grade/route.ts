import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireSubmissionAccess } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { getRequestLocale } from "@/lib/i18n/server";
import {
  applyAiSuggestion,
  dismissAiSuggestion,
  getAiSuggestion,
  suggestManualGrade,
} from "@/server/aiGradingService";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ fieldId: z.string().trim().min(1) });
const patchSchema = bodySchema.extend({ action: z.enum(["APPLY", "DISMISS"]) });

async function teacherOf(id: string) {
  const { user, isTeacher } = await requireSubmissionAccess(id);
  if (!isTeacher) throw new AppError("Bạn không có quyền truy cập bài làm này.", 403, "FORBIDDEN");
  return user;
}

export async function GET(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const user = await teacherOf(id);
    const fieldId = new URL(req.url).searchParams.get("fieldId") ?? "";
    return NextResponse.json({ suggestion: await getAiSuggestion(id, fieldId, user) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Creates (or refreshes) an AI suggestion; never changes the saved grade. */
export async function POST(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const user = await teacherOf(id);
    const { fieldId } = bodySchema.parse(await req.json());
    const locale = await getRequestLocale();
    return NextResponse.json({ suggestion: await suggestManualGrade(id, fieldId, user, { locale }) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** APPLY saves the suggestion as the grade (normal grading path); DISMISS removes it. */
export async function PATCH(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const user = await teacherOf(id);
    const { fieldId, action } = patchSchema.parse(await req.json());
    if (action === "APPLY") return NextResponse.json({ suggestion: await applyAiSuggestion(id, fieldId, user) });
    return NextResponse.json(await dismissAiSuggestion(id, fieldId, user));
  } catch (error) {
    return handleApiError(error);
  }
}
