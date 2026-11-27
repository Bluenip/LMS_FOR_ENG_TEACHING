import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { awardBehaviorPointsSchema } from "@/lib/validators";
import {
  awardBehaviorPoints,
  deleteBehaviorPoint,
  getClassBehaviorSummary,
} from "@/server/behaviorPointService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    const sp = new URL(req.url).searchParams;
    const summary = await getClassBehaviorSummary(id, {
      from: sp.get("from"),
      to: sp.get("to"),
      sessionId: sp.get("sessionId"),
    });
    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const { user } = await requireTeacherOfClass(id, "ASSISTANT");
    const data = awardBehaviorPointsSchema.parse(await req.json());
    return NextResponse.json(await awardBehaviorPoints(id, user.id, data), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    const pointId = new URL(req.url).searchParams.get("pointId");
    if (!pointId) throw new AppError("Không tìm thấy lượt điểm cộng.", 404, "NOT_FOUND");
    return NextResponse.json(await deleteBehaviorPoint(id, pointId));
  } catch (error) {
    return handleApiError(error);
  }
}
