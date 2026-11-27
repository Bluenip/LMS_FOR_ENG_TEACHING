import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { getClassAtRiskStudents, updateClassAtRiskConfig } from "@/server/masteryAnalyticsService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    return NextResponse.json(await getClassAtRiskStudents(id));
  } catch (error) {
    return handleApiError(error);
  }
}

const configSchema = z.object({
  scoreThreshold: z.number().min(0).max(10).optional(),
  missingCount: z.number().int().min(1).max(20).optional(),
});

export async function PATCH(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "CO_TEACHER");
    return NextResponse.json(await updateClassAtRiskConfig(id, configSchema.parse(await req.json())));
  } catch (error) {
    return handleApiError(error);
  }
}
