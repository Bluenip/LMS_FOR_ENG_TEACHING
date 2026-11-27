import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireRole } from "@/lib/permissions";
import { aiGenerateQuestionsSchema } from "@/lib/validators";
import {
  generateWorksheetQuestionsWithAi,
  getTeacherAiQuotaStatus,
} from "@/server/aiGeneratorService";

const aiRequestSchema = aiGenerateQuestionsSchema.extend({
  worksheetId: z.string().trim().min(1).optional().nullable(),
});

export async function GET() {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const quota = await getTeacherAiQuotaStatus(user.id);
    return NextResponse.json({ quota });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = aiRequestSchema.parse(await req.json());
    const result = await generateWorksheetQuestionsWithAi(user, data);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
