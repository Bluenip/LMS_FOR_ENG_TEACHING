import { NextResponse } from "next/server";
import { AppError, handleApiError, requireAuth } from "@/lib/permissions";
import { getStorageProvider } from "@/lib/storage";
import { authorizeFileDownload } from "@/server/worksheetService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ key: string[] }> }
) {
  try {
    const user = await requireAuth();
    const { key } = await context.params;
    const fileKey = key.map((seg) => decodeURIComponent(seg)).join("/");

    if (!fileKey || fileKey.includes("..")) {
      throw new AppError("Đường dẫn tệp không hợp lệ.", 400, "INVALID_KEY");
    }

    const allowed = await authorizeFileDownload(user.id, user.role, fileKey);
    if (!allowed) {
      throw new AppError("Bạn không có quyền tải tệp này.", 403, "FORBIDDEN");
    }

    const storage = getStorageProvider();
    const file = await storage.get(fileKey);
    if (!file) {
      throw new AppError("Không tìm thấy tệp.", 404, "NOT_FOUND");
    }

    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.size),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
