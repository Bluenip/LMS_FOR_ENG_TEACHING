import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { saveFieldToBankSchema } from "@/lib/validators";
import { saveFieldToQuestionBank } from "@/server/questionBankService";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = saveFieldToBankSchema.parse(await req.json());
    const item = await saveFieldToQuestionBank(
      data.fieldId,
      user.id,
      user.role === "ADMIN",
      {
        difficulty: data.difficulty,
        level: data.level,
        topicTag: data.topicTag,
        tags: data.tags,
        isShared: data.isShared,
      }
    );
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
