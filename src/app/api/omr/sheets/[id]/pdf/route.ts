import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { generateOmrPdf } from "@/server/omrService";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const prefill = new URL(req.url).searchParams.get("prefill") === "1";
    const { buffer, filename } = await generateOmrPdf(id, user, { prefillStudents: prefill });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
