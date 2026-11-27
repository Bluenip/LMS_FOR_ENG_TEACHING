import { NextResponse } from "next/server";
import type { FieldType, SkillTag, WorksheetSubject } from "@prisma/client";
import { handleApiError, requireRole } from "@/lib/permissions";
import { createQuestionBankItemSchema } from "@/lib/validators";
import {
  createQuestionBankItem,
  listQuestionBankItems,
} from "@/server/questionBankService";

export async function GET(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const url = new URL(req.url);
    const scopeParam = url.searchParams.get("scope");
    const scope =
      scopeParam === "mine" || scopeParam === "shared" || scopeParam === "all"
        ? scopeParam
        : "all";
    const difficultyMinRaw = url.searchParams.get("difficultyMin");
    const difficultyMaxRaw = url.searchParams.get("difficultyMax");
    const difficultyMin = difficultyMinRaw ? Number(difficultyMinRaw) : undefined;
    const difficultyMax = difficultyMaxRaw ? Number(difficultyMaxRaw) : undefined;

    const result = await listQuestionBankItems(user.id, user.role === "ADMIN", {
      scope,
      subject: (url.searchParams.get("subject") as WorksheetSubject) || undefined,
      type: (url.searchParams.get("type") as FieldType) || undefined,
      topicTag: url.searchParams.get("topicTag") || undefined,
      skillTag: (url.searchParams.get("skillTag") as SkillTag) || undefined,
      level: url.searchParams.get("level") || undefined,
      difficultyMin:
        difficultyMin !== undefined && Number.isFinite(difficultyMin)
          ? difficultyMin
          : undefined,
      difficultyMax:
        difficultyMax !== undefined && Number.isFinite(difficultyMax)
          ? difficultyMax
          : undefined,
      tag: url.searchParams.get("tag") || undefined,
      q: url.searchParams.get("q") || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = createQuestionBankItemSchema.parse(await req.json());
    const item = await createQuestionBankItem(user.id, data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
