import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  AppError,
  handleApiError,
  requireRole,
  requireTeacherOfWorksheet,
} from "@/lib/permissions";
import {
  exportWorksheetAsDocx,
  exportWorksheetAsJson,
  exportWorksheetAsPdf,
  exportWorksheetAsZip,
} from "@/server/worksheetTransferService";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") ?? "zip").toLowerCase();

    if (format === "pdf") {
      const user = await requireRole(["TEACHER", "ADMIN"]);
      const ws = await prisma.worksheet.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, ownerId: true, isShared: true },
      });
      if (!ws) {
        throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
      }
      if (user.role !== "ADMIN" && ws.ownerId !== user.id && !ws.isShared) {
        throw new AppError("Phiếu bài tập này chưa được giáo viên chia sẻ.", 403, "FORBIDDEN");
      }
      const modeParam = (url.searchParams.get("mode") ?? "student").toLowerCase();
      const mode = modeParam === "key" ? "key" : "student";
      const { buffer, filename } = await exportWorksheetAsPdf(id, mode);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(buffer.length),
        },
      });
    }

    await requireTeacherOfWorksheet(id);

    if (format === "json") {
      const { manifest, filename } = await exportWorksheetAsJson(id);
      const body = JSON.stringify(manifest, null, 2);
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    if (format === "docx" || format === "docx-student") {
      const includeAnswers = format === "docx";
      const { buffer, filename } = await exportWorksheetAsDocx(id, includeAnswers);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(buffer.length),
        },
      });
    }

    // Default: full portable backup package (.engclass.zip with PDF + audio + fields)
    const { buffer, filename } = await exportWorksheetAsZip(id);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
