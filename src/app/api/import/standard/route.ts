import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { standardImportSchema } from "@/lib/validators";
import { importStandardQuestions } from "@/server/standardImportService";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = standardImportSchema.parse(await req.json());
    return NextResponse.json(await importStandardQuestions(user, data));
  } catch (error) {
    return handleApiError(error);
  }
}
