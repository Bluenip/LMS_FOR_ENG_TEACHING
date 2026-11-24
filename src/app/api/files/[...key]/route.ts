import { NextResponse } from "next/server";
import { AppError, handleApiError, requireAuth } from "@/lib/permissions";
import { getStorageProvider } from "@/lib/storage";
import { parseByteRange } from "@/lib/storage/local";
import { authorizeFileDownload } from "@/server/worksheetService";

export async function GET(
  req: Request,
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

    const rangeHeader = req.headers.get("range");
    const storage = getStorageProvider();

    if (storage.getStream) {
      const streamed = await storage.getStream(fileKey, rangeHeader);
      if (!streamed) {
        throw new AppError("Không tìm thấy tệp.", 404, "NOT_FOUND");
      }
      const headers: Record<string, string> = {
        "Content-Type": streamed.contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      };
      if (streamed.contentLength !== undefined) {
        headers["Content-Length"] = String(streamed.contentLength);
      }
      if (streamed.contentRange) {
        headers["Content-Range"] = streamed.contentRange;
      }
      return new NextResponse(streamed.stream, {
        status: streamed.status,
        headers,
      });
    }

    const file = await storage.get(fileKey);
    if (!file) {
      throw new AppError("Không tìm thấy tệp.", 404, "NOT_FOUND");
    }

    const parsedRange = parseByteRange(rangeHeader, file.size);
    if (parsedRange) {
      const chunk = file.buffer.subarray(parsedRange.start, parsedRange.end + 1);
      return new NextResponse(new Uint8Array(chunk), {
        status: 206,
        headers: {
          "Content-Type": file.contentType,
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${parsedRange.start}-${parsedRange.end}/${file.size}`,
          "Content-Length": String(chunk.byteLength),
          "Cache-Control": "private, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Accept-Ranges": "bytes",
        "Content-Length": String(file.size),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
