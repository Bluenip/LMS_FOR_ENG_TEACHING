import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { reportWorksheetSchema } from "@/lib/validators";
import { reportDiscoverWorksheet } from "@/server/discoverService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    const data = reportWorksheetSchema.parse(await req.json());
    const report = await reportDiscoverWorksheet(id, user.id, data.reason);
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
