import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireRole } from "@/lib/permissions";
import { CONTENT_TRASH_DAYS, deleteForever, listTrash, restoreFromTrash } from "@/server/trashService";

const itemSchema = z.object({
  kind: z.enum(["WORKSHEET", "LESSON", "LESSON_ITEM"]),
  id: z.string().trim().min(1).max(64),
});

/** Library trash of the signed-in teacher (admins: everyone's). */
export async function GET() {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    return NextResponse.json({ items: await listTrash(user), retentionDays: CONTENT_TRASH_DAYS });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Restore `{ kind, id }` (and its files in Google Drive's trash). */
export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { kind, id } = itemSchema.parse(await req.json());
    return NextResponse.json(await restoreFromTrash(user, kind, id));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Delete `{ kind, id }` forever (it must already be in the trash). */
export async function DELETE(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { kind, id } = itemSchema.parse(await req.json());
    await deleteForever(user, kind, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
