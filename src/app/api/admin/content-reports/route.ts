import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { moderateReportSchema } from "@/lib/validators";
import { listContentReports, moderateContentReport } from "@/server/discoverService";

export async function GET(req: Request) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const reports = await listContentReports(status);
    return NextResponse.json({ reports });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireRole(["ADMIN"]);
    const data = moderateReportSchema.parse(await req.json());
    const report = await moderateContentReport(data.reportId, admin.id, data.action);
    return NextResponse.json({ report });
  } catch (error) {
    return handleApiError(error);
  }
}
