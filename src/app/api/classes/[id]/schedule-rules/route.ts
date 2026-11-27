import { NextResponse } from "next/server";
import { handleApiError, requireMemberOfClass, requireTeacherOfClass } from "@/lib/permissions";
import { createScheduleRuleSchema } from "@/lib/validators";
import {
  createScheduleRuleAndGenerateSessions,
  deleteScheduleRule,
  listClassScheduleRules,
} from "@/server/scheduleService";
import { AppError } from "@/lib/errors";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireMemberOfClass(id);
    const rules = await listClassScheduleRules(id);
    return NextResponse.json({ rules });
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
    const { user } = await requireTeacherOfClass(id, "CO_TEACHER");
    const body = await req.json();
    const parsed = createScheduleRuleSchema.parse(body);
    const created = await createScheduleRuleAndGenerateSessions(id, parsed, user.id);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user } = await requireTeacherOfClass(id, "CO_TEACHER");
    const url = new URL(req.url);
    let ruleId = url.searchParams.get("ruleId");
    if (!ruleId) {
      try {
        const body = (await req.json()) as { ruleId?: string };
        ruleId = body.ruleId ?? null;
      } catch {
        ruleId = null;
      }
    }
    if (!ruleId) {
      throw new AppError("Thiếu mã quy tắc lịch học.", 400, "VALIDATION_ERROR");
    }
    const res = await deleteScheduleRule(id, ruleId, user.id);
    return NextResponse.json(res);
  } catch (error) {
    return handleApiError(error);
  }
}
