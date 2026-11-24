import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { updateProfileSchema } from "@/lib/validators";
import { getOwnProfile, updateOwnProfile } from "@/server/accountService";

export async function GET() {
  try {
    const me = await requireAuth();
    return NextResponse.json({ user: await getOwnProfile(me.id) });
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
