import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { getSystemHealth } from "@/server/adminSystemOpsService";

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    return NextResponse.json(await getSystemHealth());
  } catch (error) {
    return handleApiError(error);
  }
}
