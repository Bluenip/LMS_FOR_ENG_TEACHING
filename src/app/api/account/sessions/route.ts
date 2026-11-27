import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { listLoginHistory } from "@/server/accountService";

export async function GET() {
  try {
    const user = await requireAuth();
    const sessions = await listLoginHistory(user.id);
    return NextResponse.json({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}
