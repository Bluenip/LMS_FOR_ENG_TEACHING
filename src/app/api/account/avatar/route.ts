import { NextResponse } from "next/server";
import { AppError, handleApiError, requireAuth } from "@/lib/permissions";
import { removeOwnAvatar, setOwnAvatar } from "@/server/accountService";

export async function POST(req: Request) {
  try {
    const me = await requireAuth();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Vui lòng chọn ảnh.", 400, "FILE_REQUIRED");
    const user = await setOwnAvatar(me.id, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const me = await requireAuth();
    return NextResponse.json({ user: await removeOwnAvatar(me.id) });
  } catch (error) {
    return handleApiError(error);
  }
}
