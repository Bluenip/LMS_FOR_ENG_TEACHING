import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { updateQuestionBankItemSchema } from "@/lib/validators";
import {
  deleteQuestionBankItem,
  updateQuestionBankItem,
} from "@/server/questionBankService";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = updateQuestionBankItemSchema.parse(await req.json());
    const item = await updateQuestionBankItem(id, user.id, user.role === "ADMIN", data);
    return NextResponse.json({ item });
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
    await deleteQuestionBankItem(id, user.id, user.role === "ADMIN");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
