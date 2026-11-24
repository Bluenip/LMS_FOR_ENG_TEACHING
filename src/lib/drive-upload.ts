"use client";

import { ApiError, apiFetchJson } from "./api-client";

const DRIVE_ID_RE = /^[\w-]{6,140}$/;
const MAX_RETRIES = 6;
const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB

const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
};

export function inferUploadMime(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? file.type;
}

export interface DirectDriveUploadJob {
  id: string;
  classId: string;
  lessonId: string | null;
  name: string;
  mimeType: string;
  size: number;
  kind: string;
  status: string;
  bytesUploaded: number;
  driveFileId: string | null;
  storageKey: string | null;
  shared: boolean;
  previewUrl?: string;
}

interface UploadSessionResponse {
  job: DirectDriveUploadJob;
  uploadUrl?: string;
  offset?: number;
  chunkSize?: number;
  done?: boolean;
}

class TransientUploadError extends Error {}

function putChunk(
  url: string,
  chunk: Blob,
  start: number,
  total: number,
  signal: AbortSignal | undefined,
  onBytes: (loaded: number) => void
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${start + chunk.size - 1}/${total}`);
    xhr.upload.onprogress = (evt) => onBytes(evt.loaded);
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new TransientUploadError("Network lost during upload"));
    xhr.ontimeout = () => reject(new TransientUploadError("Upload chunk timed out"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.timeout = 10 * 60 * 1000;
    xhr.send(chunk);
  });
}

function waitWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

export async function uploadDirectToDrive(
  file: File,
  options: {
    classId: string;
    lessonId?: string;
    kind: "video" | "document";
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
    onJob?: (jobId: string) => void;
    onRetry?: (attempt: number, maxAttempts: number) => void;
  }
): Promise<DirectDriveUploadJob> {
  const { signal, onProgress, onJob, onRetry } = options;

  let session = await apiFetchJson<UploadSessionResponse>("/api/drive/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      classId: options.classId,
      lessonId: options.lessonId ?? null,
      name: file.name,
      size: file.size,
      mimeType: inferUploadMime(file),
      kind: options.kind,
    }),
  });

  onJob?.(session.job.id);
  let failures = 0;

  for (;;) {
    if (session.done) {
      const doneRes = await apiFetchJson<{ job: DirectDriveUploadJob }>(
        `/api/drive/uploads/${session.job.id}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }
      );
      return doneRes.job;
    }

    let offset = session.offset ?? 0;
    const chunkSize = session.chunkSize ?? DEFAULT_CHUNK_SIZE;
    let driveFileId = "";

    try {
      onProgress?.(offset, file.size);
      while (offset < file.size) {
        const end = Math.min(offset + chunkSize, file.size);
        const base = offset;
        const result = await putChunk(
          session.uploadUrl!,
          file.slice(offset, end),
          offset,
          file.size,
          signal,
          (n) => onProgress?.(base + n, file.size)
        );

        if (result.status === 200 || result.status === 201) {
          driveFileId = (JSON.parse(result.body || "{}") as { id?: string }).id ?? "";
          offset = file.size;
          onProgress?.(file.size, file.size);
        } else if (result.status === 308) {
          offset = end;
          onProgress?.(offset, file.size);
          failures = 0;
        } else if (result.status === 429 || result.status >= 500) {
          throw new TransientUploadError("Google Drive busy");
        } else {
          throw new Error("Google Drive rejected upload chunk");
        }
      }

      const completed = await apiFetchJson<{ job: DirectDriveUploadJob }>(
        `/api/drive/uploads/${session.job.id}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            driveFileId && DRIVE_ID_RE.test(driveFileId) ? { driveFileId } : {}
          ),
        }
      );
      return completed.job;
    } catch (err) {
      if (signal?.aborted) throw err;
      const transient =
        err instanceof TransientUploadError ||
        (err instanceof ApiError && (err.status >= 500 || err.status === 429));
      if (!transient || ++failures > MAX_RETRIES) throw err;

      onRetry?.(failures, MAX_RETRIES);
      await waitWithSignal(Math.min(30_000, 1000 * 2 ** failures), signal);
      session = await apiFetchJson<UploadSessionResponse>(
        `/api/drive/uploads/${session.job.id}/resume`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal,
        }
      );
    }
  }
}

export function cancelDirectDriveUpload(jobId: string): Promise<unknown> {
  return fetch(`/api/drive/uploads/${jobId}`, { method: "DELETE" }).catch(() => undefined);
}
