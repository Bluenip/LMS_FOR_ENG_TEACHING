import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireTeacherOfAssignment } from "@/lib/permissions";
import {
  SIMILARITY_STATUSES,
  getSimilarityReportDetail,
  updateSimilarityReportStatus,
} from "@/server/similarityService";

type Ctx = { params: Promise<{ id: string; reportId: string }> };
const schema = z.object({ status: z.enum(SIMILARITY_STATUSES) });

export async function GET(_req: Request, context: Ctx) {
  try {
    const { id, reportId } = await context.params;
    await requireTeacherOfAssignment(id);
    return NextResponse.json(await getSimilarityReportDetail(id, reportId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, context: Ctx) {
  try {
    const { id, reportId } = await context.params;
    const { user } = await requireTeacherOfAssignment(id);
    const { status } = schema.parse(await req.json());
    return NextResponse.json(await updateSimilarityReportStatus(id, reportId, user.id, status));
  } catch (error) {
    return handleApiError(error);
  }
}
