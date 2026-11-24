import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireRole } from "@/lib/permissions";
import { adminParentLinkSchema } from "@/lib/validators";
import { createManualParentLink, deleteParentLink } from "@/server/adminService";

const deleteSchema = z.object({ linkId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    await requireRole(["ADMIN"]);
    const body = await req.json();
    const data = adminParentLinkSchema.parse(body);
    const link = await createManualParentLink(data.parentId, data.studentId, data.relation);
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireRole(["ADMIN"]);
    const body = await req.json();
    const { linkId } = deleteSchema.parse(body);
    await deleteParentLink(linkId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
