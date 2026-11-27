import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireTeacherOfAssignment } from "@/lib/permissions";
import { runAssignmentSimilarityCheck } from "@/server/similarityService";

const schema = z.object({
  fieldId: z.string().trim().min(1).optional().nullable(),
  minThreshold: z.number().min(0.1).max(1).optional(),
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user } = await requireTeacherOfAssignment(id);
    const data = schema.parse(await req.json().catch(() => ({})));
    return NextResponse.json(await runAssignmentSimilarityCheck(id, user.id, data));
  } catch (error) {
    return handleApiError(error);
  }
}
