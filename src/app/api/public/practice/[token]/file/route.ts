import { NextResponse } from "next/server";
import { AppError, handleApiError } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";

export async function GET(
  req: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const url = new URL(req.url);
    const key = url.searchParams.get("key")?.trim() ?? "";
    if (!key || key.includes("..")) {
      throw new AppError("Đường dẫn tệp không hợp lệ.", 400, "INVALID_KEY");
    }

    const assignment = await prisma.assignment.findFirst({
      where: {
        publicShareToken: token.trim(),
        allowPublicPractice: true,
        class: { deletedAt: null },
        worksheet: { deletedAt: null },
      },
      select: {
        worksheet: {
          select: {
            pdfFileKey: true,
            pages: { select: { imageKey: true } },
            fields: { select: { imageKey: true } },
          },
        },
      },
    });

    if (!assignment) {
      throw new AppError("Không tìm thấy tệp.", 404, "NOT_FOUND");
    }

    const allowedKeys = new Set<string>();
    if (assignment.worksheet.pdfFileKey) allowedKeys.add(assignment.worksheet.pdfFileKey);
    for (const p of assignment.worksheet.pages) {
      if (p.imageKey) allowedKeys.add(p.imageKey);
    }
    for (const f of assignment.worksheet.fields) {
      if (f.imageKey) allowedKeys.add(f.imageKey);
    }

    if (!allowedKeys.has(key)) {
      throw new AppError("Bạn không có quyền truy cập tệp này.", 403, "FORBIDDEN");
    }

    const storage = getStorageProvider();
    const file = await storage.get(key);
    if (!file) {
      throw new AppError("Không tìm thấy tệp.", 404, "NOT_FOUND");
    }

    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.size),
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
