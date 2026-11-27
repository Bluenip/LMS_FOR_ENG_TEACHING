import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { extractFlashcardsSchema } from "@/lib/validators";
import { extractFlashcardsFromWorksheet } from "@/server/flashcardService";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const body = await req.json();
    const parsed = extractFlashcardsSchema.parse(body);
    const deck = await extractFlashcardsFromWorksheet(
      user.id,
      user.role === "ADMIN",
      parsed
    );
    return NextResponse.json({ deck }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
