import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { updateFolderSchema } from "@/lib/validators";
import { deleteUserFolder, updateUserFolder } from "@/server/folderService";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { id } = await context.params;
    const data = updateFolderSchema.parse(await req.json());
    const folder = await updateUserFolder(user.id, id, data);
    return NextResponse.json({ folder });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { id } = await context.params;
    await deleteUserFolder(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
