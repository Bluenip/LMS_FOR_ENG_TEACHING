import { NextResponse } from "next/server";
import { getActiveBanner } from "@/server/adminSystemOpsService";

/** Public: the active system banner (no auth, used on every page). */
export async function GET() {
  const banner = await getActiveBanner().catch(() => null);
  return NextResponse.json(
    { banner: banner ? { message: banner.message, level: banner.level, maintenanceMode: banner.maintenanceMode } : null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
