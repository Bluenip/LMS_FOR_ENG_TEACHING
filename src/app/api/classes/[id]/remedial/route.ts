import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { clearAnalyticsCache, createRemedialAssignmentFromWeakTopics } from "@/server/masteryAnalyticsService";

const schema = z.object({
  topicTags: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  studentIds: z.array(z.string().trim().min(1)).min(1).max(200),
  questionCount: z.number().int().min(1).max(40).default(10),
  dueAt: z.string().datetime().optional().nullable(),
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user } = await requireTeacherOfClass(id, "CO_TEACHER");
    const data = schema.parse(await req.json());
    const result = await createRemedialAssignmentFromWeakTopics(id, user, data);
    clearAnalyticsCache();
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
