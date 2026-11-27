import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { getCalendarTokenStatus, revokeCalendarToken, rotateCalendarToken } from "@/server/calendarFeedService";

export async function GET() {
  try {
    const user = await requireAuth();
    return NextResponse.json(await getCalendarTokenStatus(user.id));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Creates / rotates the token; the raw URL is returned only in this response. */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const { token } = await rotateCalendarToken(user.id);
    const origin = new URL(req.url).origin;
    return NextResponse.json({ url: `${origin}/api/calendar/feed?token=${token}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const user = await requireAuth();
    return NextResponse.json(await revokeCalendarToken(user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
