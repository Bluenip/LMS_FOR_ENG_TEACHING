import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { listDiscoverWorksheets } from "@/server/discoverService";

export async function GET(req: Request) {
  try {
    let viewerId: string | null = null;
    try {
      viewerId = (await requireAuth()).id;
    } catch {
      viewerId = null;
    }

    const url = new URL(req.url);
    const worksheets = await listDiscoverWorksheets({
      q: url.searchParams.get("q"),
      subject: url.searchParams.get("subject"),
      publicLevel: url.searchParams.get("publicLevel"),
      sort: url.searchParams.get("sort"),
      viewerId,
    });
    return NextResponse.json({ worksheets });
  } catch (error) {
    return handleApiError(error);
  }
}
