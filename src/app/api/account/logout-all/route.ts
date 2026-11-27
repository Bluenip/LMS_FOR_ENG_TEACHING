import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { signOutAllDevices } from "@/server/accountService";

export async function POST() {
  try {
    const user = await requireAuth();
    const result = await signOutAllDevices(user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
