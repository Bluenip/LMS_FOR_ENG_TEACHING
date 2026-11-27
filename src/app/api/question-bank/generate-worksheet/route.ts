import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { getRequestLocale } from "@/lib/i18n/server";
import { localizeApiError } from "@/lib/i18n/api-errors";
import { generateWorksheetFromMatrixSchema } from "@/lib/validators";
import {
  generateWorksheetFromMatrix,
  MatrixInsufficientError,
  previewMatrixAvailability,
} from "@/server/questionBankService";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = generateWorksheetFromMatrixSchema.parse(await req.json());

    if (data.preview) {
      const preview = await previewMatrixAvailability(
        user.id,
        user.role === "ADMIN",
        data.rows,
        data.includeShared
      );
      return NextResponse.json(preview);
    }

    const result = await generateWorksheetFromMatrix(user.id, user.role === "ADMIN", {
      title: data.title,
      subject: data.subject,
      instructions: data.instructions,
      includeShared: data.includeShared,
      rows: data.rows,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof MatrixInsufficientError) {
      const locale = await getRequestLocale();
      return NextResponse.json(
        {
          error: localizeApiError(error.message, error.code, locale),
          code: error.code,
          shortages: error.shortages,
        },
        { status: 400 }
      );
    }
    return handleApiError(error);
  }
}
