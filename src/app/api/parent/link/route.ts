import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { redeemParentInviteSchema } from "@/lib/validators";
import { redeemParentInviteCode } from "@/server/parentService";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["PARENT"]);
    const body = await req.json();
    const data = redeemParentInviteSchema.parse(body);
    const link = await redeemParentInviteCode(user.id, data.code, data.relation);
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
