import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AppError, handleApiError, requireRole } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { getStorageProvider } from "@/lib/storage";

const MAX_SNAPSHOT_BYTES = 120 * 1024; // 120 KB

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["STUDENT"]);
    const { id: submissionId } = await context.params;

    const rl = checkRateLimit(`proctor-snap:${submissionId}`, 30, 60_000);
    if (!rl.allowed) {
      throw new AppError("Gửi ảnh giám sát quá nhanh, vui lòng thử lại sau.", 429, "RATE_LIMITED");
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        studentId: true,
        status: true,
        assignment: {
          select: {
            requireCamera: true,
            cameraSnapshots: true,
          },
        },
      },
    });

    if (!submission || submission.studentId !== user.id) {
      throw new AppError("Không tìm thấy bài làm.", 404, "NOT_FOUND");
    }
    if (submission.status !== "IN_PROGRESS") {
      throw new AppError("Bài làm đã kết thúc.", 409, "ALREADY_SUBMITTED");
    }
    if (!submission.assignment.requireCamera || !submission.assignment.cameraSnapshots) {
      throw new AppError("Bài tập này không bật lưu ảnh giám sát.", 403, "SNAPSHOTS_DISABLED");
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("Thiếu ảnh chụp giám sát.", 400, "MISSING_FILE");
    }
    if (file.type && file.type !== "image/jpeg") {
      throw new AppError("Chỉ chấp nhận định dạng ảnh JPEG.", 400, "INVALID_MIME");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_SNAPSHOT_BYTES) {
      throw new AppError("Ảnh giám sát vượt quá giới hạn 120KB.", 413, "FILE_TOO_LARGE");
    }
    // Verify JPEG magic bytes (FF D8 FF)
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      throw new AppError("Dữ liệu ảnh JPEG không hợp lệ.", 400, "INVALID_JPEG");
    }

    const key = `proctor/${submissionId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
    await getStorageProvider().put(key, buffer, "image/jpeg");

    return NextResponse.json({ key }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
