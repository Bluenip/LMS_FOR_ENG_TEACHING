import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { buildSampleFillBlankDocx } from "@/lib/worksheet/docx-builder";

export async function GET() {
  try {
    await requireRole(["TEACHER", "ADMIN"]);
    const buffer = await buildSampleFillBlankDocx();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="engclass-mau-dien-tu.docx"',
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
