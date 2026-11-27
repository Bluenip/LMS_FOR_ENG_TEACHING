import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { bannerSchema } from "@/lib/validators";
import { getBannerForAdmin, saveBanner } from "@/server/adminSystemOpsService";

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    return NextResponse.json({ banner: await getBannerForAdmin() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireRole(["ADMIN"]);
    const data = bannerSchema.parse(await req.json());
    return NextResponse.json({ banner: await saveBanner(user.id, data) });
  } catch (error) {
    return handleApiError(error);
  }
}
