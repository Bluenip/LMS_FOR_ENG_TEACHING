import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getStorageProvider } from "@/lib/storage";
import { enqueueDriveTrashForKeys } from "./driveService";
import { getServerDeadline } from "./submissionService";

const ALLOWED_AUDIO_MIMES: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".m4a",
  "audio/webm": ".webm",
};

const EXT_TO_MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".webm": "audio/webm",
};

function getAudioMaxBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_SIZE_MB || "30");
  return (Number.isFinite(mb) && mb > 0 ? mb : 30) * 1024 * 1024;
}

function getSigningSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "engclass-audio-stream-dev-secret"
  );
}

export interface AudioStreamTokenPayload {
  sid: string;
  aid: string;
  uid: string;
  exp: number;
}

export function signAudioStreamToken(payload: AudioStreamTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyAudioStreamToken(token: string): AudioStreamTokenPayload | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(body)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<AudioStreamTokenPayload>;
    if (
      typeof parsed.sid !== "string" ||
      typeof parsed.aid !== "string" ||
      typeof parsed.uid !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    return parsed as AudioStreamTokenPayload;
  } catch {
    return null;
  }
}

export function resolveAudioExtension(mimeType: string, filename?: string): { ext: string; mime: string } {
  const cleanMime = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (cleanMime && ALLOWED_AUDIO_MIMES[cleanMime]) {
    const ext = ALLOWED_AUDIO_MIMES[cleanMime]!;
    return { ext, mime: EXT_TO_MIME[ext] ?? cleanMime };
  }
  if (filename) {
    const lower = filename.toLowerCase();
    for (const [ext, mime] of Object.entries(EXT_TO_MIME)) {
      if (lower.endsWith(ext)) {
        return { ext, mime };
      }
    }
  }
  throw new AppError(
    "Định dạng file nghe không được hỗ trợ (chỉ nhận MP3, WAV, OGG, M4A, WebM).",
    400,
    "UNSUPPORTED_AUDIO_TYPE"
  );
}

export async function listWorksheetAudios(worksheetId: string) {
  return prisma.worksheetAudio.findMany({
    where: { worksheetId },
    orderBy: { order: "asc" },
  });
}

export async function uploadWorksheetAudio(
  worksheetId: string,
  input: {
    buffer: Buffer;
    mimeType: string;
    originalFilename?: string;
    title?: string;
    durationSec?: number | null;
  }
) {
  if (!input.buffer || input.buffer.length === 0) {
    throw new AppError("File nghe bị rỗng.", 400, "EMPTY_FILE");
  }
  const maxBytes = getAudioMaxBytes();
  if (input.buffer.length > maxBytes) {
    throw new AppError(
      `Dung lượng file nghe vượt quá giới hạn ${Math.round(maxBytes / (1024 * 1024))}MB.`,
      413,
      "FILE_TOO_LARGE"
    );
  }

  const { ext, mime } = resolveAudioExtension(input.mimeType, input.originalFilename);

  const ws = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    select: { id: true, ownerId: true, title: true, _count: { select: { audios: true } } },
  });
  if (!ws) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }

  const fileKey = `worksheets/${worksheetId}/audio/${crypto.randomUUID()}${ext}`;
  await getStorageProvider().put(fileKey, input.buffer, mime, {
    ownerId: ws.ownerId,
    kind: "WORKSHEET_AUDIO",
    worksheetId,
    worksheetTitle: ws.title,
    fileName: `audio-${ws._count.audios + 1}${ext}`,
  });

  const fallbackTitle =
    input.originalFilename?.replace(/\.[^.]+$/, "").trim() ||
    `File nghe ${ws._count.audios + 1}`;
  const title = (input.title?.trim() || fallbackTitle).slice(0, 200);

  return prisma.worksheetAudio.create({
    data: {
      worksheetId,
      title,
      fileKey,
      mimeType: mime,
      sizeBytes: input.buffer.length,
      durationSec:
        input.durationSec !== undefined &&
        input.durationSec !== null &&
        Number.isFinite(input.durationSec)
          ? Math.max(0, Math.round(input.durationSec))
          : null,
      order: ws._count.audios,
    },
  });
}

export async function updateWorksheetAudio(
  worksheetId: string,
  audioId: string,
  input: { title?: string; order?: number; durationSec?: number | null }
) {
  const existing = await prisma.worksheetAudio.findFirst({
    where: { id: audioId, worksheetId },
  });
  if (!existing) {
    throw new AppError("Không tìm thấy file nghe.", 404, "NOT_FOUND");
  }
  return prisma.worksheetAudio.update({
    where: { id: audioId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
      ...(input.durationSec !== undefined ? { durationSec: input.durationSec } : {}),
    },
  });
}

export async function deleteWorksheetAudio(worksheetId: string, audioId: string) {
  const existing = await prisma.worksheetAudio.findFirst({
    where: { id: audioId, worksheetId },
  });
  if (!existing) {
    throw new AppError("Không tìm thấy file nghe.", 404, "NOT_FOUND");
  }
  const queued = await enqueueDriveTrashForKeys([existing.fileKey], "AUDIO_DELETED");
  await prisma.worksheetAudio.delete({ where: { id: audioId } });
  if (queued === 0) {
    await getStorageProvider().delete(existing.fileKey).catch(() => undefined);
  }
}

/**
 * Atomically checks the server-side play limit for (submissionId, audioId),
 * records one AudioPlay row, and returns a short-lived signed stream token.
 * Note:
 *  - New attempt = new Submission -> plays reset cleanly.
 *  - RESTART violation reuses the same Submission -> plays are NOT reset.
 */
export async function requestAudioPlay(
  submissionId: string,
  audioId: string,
  studentId: string
) {
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const submission = await tx.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          select: {
            id: true,
            worksheetId: true,
            timeLimitMin: true,
            dueAt: true,
            allowLate: true,
            audioMaxPlays: true,
          },
        },
      },
    });

    if (!submission || submission.studentId !== studentId) {
      throw new AppError("Không tìm thấy bài làm.", 404, "NOT_FOUND");
    }

    if (submission.status !== "IN_PROGRESS") {
      throw new AppError("Bài làm đã nộp, không thể phát thêm lượt nghe mới.", 409, "ALREADY_SUBMITTED");
    }

    if (submission.lockedAt) {
      throw new AppError("Bài làm đang bị khoá.", 423, "SUBMISSION_LOCKED");
    }

    const deadline = getServerDeadline(submission, submission.assignment);
    if (deadline && now >= deadline) {
      throw new AppError("Đã hết thời gian làm bài.", 409, "TIME_EXPIRED");
    }

    const audio = await tx.worksheetAudio.findFirst({
      where: { id: audioId, worksheetId: submission.assignment.worksheetId },
    });
    if (!audio) {
      throw new AppError("Không tìm thấy file nghe trong bài tập này.", 404, "NOT_FOUND");
    }

    const currentPlays = await tx.audioPlay.count({
      where: { submissionId, audioId },
    });

    const maxPlays = submission.assignment.audioMaxPlays;
    if (maxPlays !== null && currentPlays >= maxPlays) {
      throw new AppError(
        `Bạn đã dùng hết ${maxPlays} lượt nghe cho file "${audio.title}".`,
        403,
        "AUDIO_PLAY_LIMIT_REACHED"
      );
    }

    await tx.audioPlay.create({
      data: {
        submissionId,
        audioId,
        startedAt: now,
      },
    });

    const playsUsed = currentPlays + 1;
    const ttlMs = Math.max(10 * 60_000, ((audio.durationSec ?? 0) + 180) * 1000);
    const token = signAudioStreamToken({
      sid: submissionId,
      aid: audioId,
      uid: studentId,
      exp: now.getTime() + ttlMs,
    });

    return {
      playsUsed,
      maxPlays,
      playsLeft: maxPlays !== null ? Math.max(0, maxPlays - playsUsed) : null,
      token,
      streamUrl: `/api/submissions/${submissionId}/audio/${audioId}/stream?token=${encodeURIComponent(token)}`,
    };
  });

  return result;
}

/**
 * Authorizes streaming an audio file for a student via signed play token.
 */
export async function getAuthorizedAudioStream(
  submissionId: string,
  audioId: string,
  studentId: string,
  token: string | null
) {
  if (!token) {
    throw new AppError("Thiếu mã xác thực phát âm thanh.", 403, "MISSING_AUDIO_TOKEN");
  }
  const payload = verifyAudioStreamToken(token);
  if (
    !payload ||
    payload.sid !== submissionId ||
    payload.aid !== audioId ||
    payload.uid !== studentId
  ) {
    throw new AppError("Mã phát âm thanh không hợp lệ hoặc đã hết hạn.", 403, "INVALID_AUDIO_TOKEN");
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      studentId: true,
      assignment: { select: { worksheetId: true } },
    },
  });
  if (!submission || submission.studentId !== studentId) {
    throw new AppError("Không có quyền truy cập file nghe.", 403, "FORBIDDEN");
  }

  const audio = await prisma.worksheetAudio.findFirst({
    where: { id: audioId, worksheetId: submission.assignment.worksheetId },
  });
  if (!audio) {
    throw new AppError("Không tìm thấy file nghe.", 404, "NOT_FOUND");
  }

  const stored = await getStorageProvider().get(audio.fileKey);
  if (!stored) {
    throw new AppError("Không tìm thấy dữ liệu file nghe.", 404, "NOT_FOUND");
  }

  return {
    buffer: stored.buffer,
    size: stored.size,
    mimeType: audio.mimeType || stored.contentType,
  };
}

export async function getAuthorizedAudioRangeStream(
  submissionId: string,
  audioId: string,
  studentId: string,
  token: string | null,
  rangeHeader: string | null
) {
  if (!token) {
    throw new AppError("Thiếu mã xác thực phát âm thanh.", 403, "MISSING_AUDIO_TOKEN");
  }
  const payload = verifyAudioStreamToken(token);
  if (
    !payload ||
    payload.sid !== submissionId ||
    payload.aid !== audioId ||
    payload.uid !== studentId
  ) {
    throw new AppError("Mã phát âm thanh không hợp lệ hoặc đã hết hạn.", 403, "INVALID_AUDIO_TOKEN");
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      studentId: true,
      assignment: { select: { worksheetId: true } },
    },
  });
  if (!submission || submission.studentId !== studentId) {
    throw new AppError("Không có quyền truy cập file nghe.", 403, "FORBIDDEN");
  }

  const audio = await prisma.worksheetAudio.findFirst({
    where: { id: audioId, worksheetId: submission.assignment.worksheetId },
  });
  if (!audio) {
    throw new AppError("Không tìm thấy file nghe.", 404, "NOT_FOUND");
  }

  const storage = getStorageProvider();
  if (storage.getStream) {
    const streamed = await storage.getStream(audio.fileKey, rangeHeader);
    if (streamed) {
      return {
        stream: streamed.stream,
        status: streamed.status,
        mimeType: audio.mimeType || streamed.contentType,
        contentLength: streamed.contentLength,
        contentRange: streamed.contentRange,
      };
    }
  }

  const stored = await storage.get(audio.fileKey);
  if (!stored) {
    throw new AppError("Không tìm thấy dữ liệu file nghe.", 404, "NOT_FOUND");
  }

  return {
    buffer: stored.buffer,
    size: stored.size,
    mimeType: audio.mimeType || stored.contentType,
  };
}
