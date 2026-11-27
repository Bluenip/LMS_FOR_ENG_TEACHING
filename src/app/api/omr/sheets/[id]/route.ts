import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { updateOmrSheetSchema } from "@/lib/validators";
import { deleteOmrSheet, getOmrSheetDetail, updateOmrSheet } from "@/server/omrService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    return NextResponse.json(await getOmrSheetDetail(id, user));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = updateOmrSheetSchema.parse(await req.json());
    return NextResponse.json(await updateOmrSheet(id, user, data));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    return NextResponse.json(await deleteOmrSheet(id, user));
  } catch (error) {
    return handleApiError(error);
  }
}
