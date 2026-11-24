import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { exportAllTeacherWorksheetsZip } from "@/server/worksheetTransferService";

export async function GET() {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { buffer, filename } = await exportAllTeacherWorksheetsZip(user.id);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
