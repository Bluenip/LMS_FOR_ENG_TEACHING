import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { getAuthorizedAudioStream } from "@/server/worksheetAudioService";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; audioId: string }> }
) {
  try {
    const user = await requireRole(["STUDENT"]);
    const { id, audioId } = await context.params;
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    const { buffer, size, mimeType } = await getAuthorizedAudioStream(
      id,
      audioId,
      user.id,
      token
    );

    const baseHeaders: Record<string, string> = {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    };

    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        if (
          Number.isFinite(start) &&
          Number.isFinite(end) &&
          start >= 0 &&
          start <= end &&
          start < size
        ) {
          const chunk = buffer.subarray(start, end + 1);
          return new NextResponse(new Uint8Array(chunk), {
            status: 206,
            headers: {
              ...baseHeaders,
              "Content-Range": `bytes ${start}-${end}/${size}`,
              "Content-Length": String(chunk.length),
            },
          });
        }
      }
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Length": String(size),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
