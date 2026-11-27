import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { setGradebookLock } from "@/server/termService";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user } = await requireTeacherOfClass(id, "CO_TEACHER");
    const { lock } = z.object({ lock: z.boolean() }).parse(await req.json());
    return NextResponse.json(await setGradebookLock(id, user, lock));
  } catch (error) {
    return handleApiError(error);
  }
}
