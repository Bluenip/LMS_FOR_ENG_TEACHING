import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { claimBulkImportCredentialsExcel } from "@/server/bulkImportService";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(["ADMIN"]);
    const { id } = await context.params;
    const buffer = await claimBulkImportCredentialsExcel(actor, id);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="engclass-temp-passwords.xlsx"',
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
