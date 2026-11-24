import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { parseByteRange } from "@/lib/storage/local";
import { getAuthorizedAudioRangeStream } from "@/server/worksheetAudioService";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; audioId: string }> }
) {
  try {
    const user = await requireRole(["STUDENT"]);
    const { id, audioId } = await context.params;
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const rangeHeader = req.headers.get("range");

    const audioRes = await getAuthorizedAudioRangeStream(
      id,
      audioId,
      user.id,
      token,
      rangeHeader
    );

    const baseHeaders: Record<string, string> = {
      "Content-Type": audioRes.mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    };

    if ("stream" in audioRes && audioRes.stream) {
      const headers: Record<string, string> = { ...baseHeaders };
      if (audioRes.contentLength !== undefined) {
        headers["Content-Length"] = String(audioRes.contentLength);
      }
      if (audioRes.contentRange) {
        headers["Content-Range"] = audioRes.contentRange;
      }
      return new NextResponse(audioRes.stream, {
        status: audioRes.status,
        headers,
      });
    }

    const { buffer, size } = audioRes;
    const parsedRange = parseByteRange(rangeHeader, size);
    if (parsedRange) {
      const chunk = buffer.subarray(parsedRange.start, parsedRange.end + 1);
      return new NextResponse(new Uint8Array(chunk), {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${parsedRange.start}-${parsedRange.end}/${size}`,
          "Content-Length": String(chunk.length),
        },
      });
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
