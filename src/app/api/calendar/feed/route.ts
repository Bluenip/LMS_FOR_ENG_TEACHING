import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/permissions";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { buildCalendarFeed } from "@/server/calendarFeedService";

/** Public .ics feed authenticated only by the secret token (calendar apps cannot log in). */
export async function GET(req: Request) {
  try {
    const rl = await checkRateLimitAsync(`ics:${getClientIp(req.headers)}`, 60, 60_000);
    if (!rl.allowed) throw new AppError("Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.", 429, "RATE_LIMITED");
    const url = new URL(req.url);
    const ics = await buildCalendarFeed(url.searchParams.get("token") ?? "", url.origin);
    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="pivora.ics"',
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
