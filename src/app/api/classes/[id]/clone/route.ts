import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { cloneClassSchema } from "@/lib/validators";
import { cloneClass } from "@/server/classService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user } = await requireTeacherOfClass(id, "CO_TEACHER");
    const data = cloneClassSchema.parse(await req.json());
    const cloned = await cloneClass(id, user.id, data.name);
    return NextResponse.json({ class: cloned }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
