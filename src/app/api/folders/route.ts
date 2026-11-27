import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { createFolderSchema } from "@/lib/validators";
import { createUserFolder, listUserFolders } from "@/server/folderService";

export async function GET(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const url = new URL(req.url);
    const kindParam = url.searchParams.get("kind");
    const kind =
      kindParam === "WORKSHEET" || kindParam === "LESSON" ? kindParam : undefined;
    const data = await listUserFolders(user.id, kind);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = createFolderSchema.parse(await req.json());
    const folder = await createUserFolder(user.id, data);
    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
