import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { adminUpdateUserSchema } from "@/lib/validators";
import { adminUpdateUser } from "@/server/adminService";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireRole(["ADMIN"]);
    const { id } = await context.params;
    const body = await req.json();
    const data = adminUpdateUserSchema.parse(body);
    const user = await adminUpdateUser(id, actor.id, data);
    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
