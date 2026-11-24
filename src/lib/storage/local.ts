import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type {
  StorageGetResult,
  StorageProvider,
  StoragePutResult,
  StorageStreamResult,
} from "./types";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".zip": "application/zip",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function parseByteRange(
  rangeHeader: string | null | undefined,
  totalSize: number
): { start: number; end: number } | null {
  if (!rangeHeader || totalSize <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;
  const startStr = match[1];
  const endStr = match[2];
  if (!startStr && !endStr) return null;

  let start: number;
  let end: number;
  if (!startStr && endStr) {
    // Suffix range: bytes=-500
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    start = Number(startStr);
    end = endStr ? Math.min(Number(endStr), totalSize - 1) : totalSize - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start > end ||
    start >= totalSize
  ) {
    return null;
  }
  return { start, end };
}

export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = path.resolve(baseDir ?? process.env.LOCAL_UPLOAD_DIR ?? "./uploads");
  }

  private resolveSafePath(key: string): string {
    const cleaned = key.replace(/^\/+/, "");
    if (!cleaned || cleaned.includes("..") || cleaned.includes("\0")) {
      throw new Error("Invalid storage key");
    }
    const target = path.resolve(this.baseDir, cleaned);
    if (!target.startsWith(this.baseDir + path.sep) && target !== this.baseDir) {
      throw new Error("Path traversal detected");
    }
    return target;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoragePutResult> {
    const target = this.resolveSafePath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    return { key, size: data.byteLength, contentType, driver: "local" };
  }

  async get(key: string): Promise<StorageGetResult | null> {
    const target = this.resolveSafePath(key);
    try {
      const buffer = await fs.readFile(target);
      const ext = path.extname(target).toLowerCase();
      return {
        buffer,
        contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
        size: buffer.byteLength,
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async getStream(key: string, range?: string | null): Promise<StorageStreamResult | null> {
    const target = this.resolveSafePath(key);
    try {
      const stat = await fs.stat(target);
      const size = stat.size;
      const ext = path.extname(target).toLowerCase();
      const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

      const parsed = parseByteRange(range, size);
      if (parsed) {
        const nodeStream = createReadStream(target, {
          start: parsed.start,
          end: parsed.end,
        });
        return {
          stream: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
          contentType,
          status: 206,
          contentLength: parsed.end - parsed.start + 1,
          contentRange: `bytes ${parsed.start}-${parsed.end}/${size}`,
        };
      }

      const nodeStream = createReadStream(target);
      return {
        stream: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
        contentType,
        status: 200,
        contentLength: size,
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const target = this.resolveSafePath(key);
    try {
      await fs.unlink(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const target = this.resolveSafePath(key);
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }
}
