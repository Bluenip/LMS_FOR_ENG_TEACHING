import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/permissions";
import { recordError } from "@/server/errorLogService";

const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  stack: z.string().max(8000).optional().nullable(),
  path: z.string().max(500).optional().nullable(),
  level: z.enum(["ERROR", "WARN", "FATAL"]).optional().default("ERROR"),
  meta: z.record(z.unknown()).optional(),
});

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const session = await auth().catch(() => null);
    const key = session?.user?.id ? `client-err:u:${session.user.id}` : `client-err:ip:${ip}`;
    const limit = checkRateLimit(key, 20, 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json({ ok: false, rateLimited: true }, { status: 429 });
    }

    const body = clientErrorSchema.parse(await req.json());
    await recordError({
      source: "CLIENT",
      level: body.level,
      message: body.message,
      stack: body.stack ?? null,
      path: body.path ?? null,
      userId: session?.user?.id ?? null,
      userAgent: req.headers.get("user-agent"),
      meta: body.meta,
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
