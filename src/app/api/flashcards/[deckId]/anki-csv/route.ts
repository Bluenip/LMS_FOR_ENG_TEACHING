import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireAuth, requireRole } from "@/lib/permissions";
import { exportDeckAsAnki, importAnkiIntoDeck } from "@/server/standardImportService";

type Ctx = { params: Promise<{ deckId: string }> };

export async function GET(_req: Request, context: Ctx) {
  try {
    const { deckId } = await context.params;
    const user = await requireAuth();
    const { text, filename } = await exportDeckAsAnki(deckId, user);
    return new NextResponse(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request, context: Ctx) {
  try {
    const { deckId } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN", "STUDENT"]);
    const { content } = z.object({ content: z.string().min(1).max(2_000_000) }).parse(await req.json());
    return NextResponse.json(await importAnkiIntoDeck(deckId, user, content));
  } catch (error) {
    return handleApiError(error);
  }
}
