import { NextResponse } from "next/server";
import { handleApiError, requireAuth, requireRole } from "@/lib/permissions";
import { updateOmrScanSchema } from "@/lib/validators";
import { deleteOmrScan, getOmrScanView, updateOmrScan } from "@/server/omrService";

type Ctx = { params: Promise<{ scanId: string }> };

export async function GET(_req: Request, context: Ctx) {
  try {
    const { scanId } = await context.params;
    const user = await requireAuth();
    return NextResponse.json(await getOmrScanView(scanId, user));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, context: Ctx) {
  try {
    const { scanId } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = updateOmrScanSchema.parse(await req.json());
    return NextResponse.json(await updateOmrScan(scanId, user, data));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, context: Ctx) {
  try {
    const { scanId } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    return NextResponse.json(await deleteOmrScan(scanId, user));
  } catch (error) {
    return handleApiError(error);
  }
}
