import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireRole } from "@/lib/permissions";
import { AUDIT_ACTIONS, listAuditLogs } from "@/server/auditService";

const auditQuerySchema = z.object({
  actorId: z.string().trim().min(1).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function GET(req: Request) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    const raw = {
      actorId: url.searchParams.get("actorId") || undefined,
      action: url.searchParams.get("action") || undefined,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      q: url.searchParams.get("q") || undefined,
      page: url.searchParams.get("page") || undefined,
      pageSize: url.searchParams.get("pageSize") || undefined,
    };
    const parsed = auditQuerySchema.parse(raw);
    const data = await listAuditLogs(parsed);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
