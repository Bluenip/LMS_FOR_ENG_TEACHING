import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { handleApiError, requireAuth, requireRole } from "@/lib/permissions";
import { createFlashcardDeckSchema } from "@/lib/validators";
import {
  createFlashcardDeck,
  deleteFlashcardDeck,
  listFlashcardDecksForUser,
} from "@/server/flashcardService";

export async function GET() {
  try {
    const user = await requireAuth();
    const decks = await listFlashcardDecksForUser(user.id, user.role);
    return NextResponse.json({ decks });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN", "STUDENT"]);
    const body = await req.json();
    const parsed = createFlashcardDeckSchema.parse(body);
    const deck = await createFlashcardDeck(user.id, user.role, parsed);
    return NextResponse.json({ deck }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) throw new AppError("Không tìm thấy bộ thẻ.", 404, "NOT_FOUND");
    const res = await deleteFlashcardDeck(id, user.id, user.role === "ADMIN");
    return NextResponse.json(res);
  } catch (error) {
    return handleApiError(error);
  }
}
