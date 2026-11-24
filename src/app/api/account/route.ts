import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { updateProfileSchema } from "@/lib/validators";
import { updateOwnProfile } from "@/server/accountService";

export async function GET() {
  try {
    const me = await requireAuth();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: me.id },
      select: { id: true, name: true, email: true, phone: true, role: true, avatarUrl: true, mustChangePassword: true, createdAt: true },
    });
    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const me = await requireAuth();
    const data = updateProfileSchema.parse(await req.json());
    return NextResponse.json({ user: await updateOwnProfile(me.id, data) });
  } catch (error) {
    return handleApiError(error);
  }
}
