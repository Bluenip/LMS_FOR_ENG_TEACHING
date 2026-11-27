import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { listMyOmrScans } from "@/server/omrService";

export async function GET(req: Request) {
  try {
    const user = await requireRole(["STUDENT", "PARENT"]);
    const sp = new URL(req.url).searchParams;
    const scans = await listMyOmrScans(user, { studentId: sp.get("studentId"), classId: sp.get("classId") });
    return NextResponse.json({ scans });
  } catch (error) {
    return handleApiError(error);
  }
}
