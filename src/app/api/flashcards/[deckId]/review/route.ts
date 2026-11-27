import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { submitFlashcardReviewSchema } from "@/lib/validators";
import { getDeckReviewQueue, submitFlashcardReview } from "@/server/flashcardService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ deckId: string }> }
) {
  try {
    const user = await requireAuth();
    const { deckId } = await context.params;
    const queue = await getDeckReviewQueue(deckId, user.id, user.role);
    return NextResponse.json(queue);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ deckId: string }> }
) {
  try {
    const user = await requireAuth();
    const { deckId } = await context.params;
    const body = await req.json();
    const parsed = submitFlashcardReviewSchema.parse(body);
    const review = await submitFlashcardReview(
      deckId,
      parsed.flashcardId,
      user.id,
      user.role,
      parsed.quality
    );
    return NextResponse.json({ review });
  } catch (error) {
    return handleApiError(error);
  }
}
