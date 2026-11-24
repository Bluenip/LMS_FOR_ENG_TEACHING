import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireRole } from "@/lib/permissions";
import { listRecentErrors } from "@/server/errorLogService";

const querySchema = z.object({
  source: z.enum(["SERVER", "CLIENT"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export async function GET(req: Request) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    const parsed = querySchema.parse({
      source: url.searchParams.get("source") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });
    const data = await listRecentErrors(parsed);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
