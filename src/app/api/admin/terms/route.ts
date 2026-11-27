import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { termSchema } from "@/lib/validators";
import { listTerms, saveTerm } from "@/server/termService";

export async function GET() {
  try {
    await requireRole(["ADMIN", "TEACHER"]);
    return NextResponse.json({ terms: await listTerms() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["ADMIN"]);
    const data = termSchema.parse(await req.json());
    return NextResponse.json({ term: await saveTerm(user.id, { ...data, id: undefined }) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireRole(["ADMIN"]);
    const data = termSchema.parse(await req.json());
    return NextResponse.json({ term: await saveTerm(user.id, data) });
  } catch (error) {
    return handleApiError(error);
  }
}
