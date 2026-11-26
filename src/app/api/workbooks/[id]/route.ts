import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { updateWorkbookSchema } from "@/lib/validators";
import {
  deleteWorkbook,
  getWorkbookById,
  updateWorkbook,
} from "@/server/workbookService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const workbook = await getWorkbookById(id, { id: user.id, role: user.role });
    return NextResponse.json({ workbook });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = updateWorkbookSchema.parse(await req.json());
    const workbook = await updateWorkbook(id, { id: user.id, role: user.role }, data);
    return NextResponse.json({ workbook });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    await deleteWorkbook(id, { id: user.id, role: user.role });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
