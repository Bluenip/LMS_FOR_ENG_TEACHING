import { NextResponse } from "next/server";
import { z } from "zod";
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

const selectionSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(500),
});

/** Backup of selected worksheets (only the caller's own ones are packed). */
export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { ids } = selectionSchema.parse(await req.json());
    const { buffer, filename } = await exportAllTeacherWorksheetsZip(user.id, ids);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
