import fs from "node:fs/promises";
import path from "node:path";
import type { StorageGetResult, StorageProvider, StoragePutResult } from "./types";

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
};

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
    return { key, size: data.byteLength, contentType };
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
