import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { generateBulkImportTemplate } from "@/server/bulkImportService";

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const buffer = await generateBulkImportTemplate();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="pivora-users-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
