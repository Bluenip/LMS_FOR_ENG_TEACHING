import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

let cachedProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cachedProvider) return cachedProvider;
  const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  if (driver === "s3") {
    cachedProvider = new S3StorageProvider();
  } else {
    cachedProvider = new LocalStorageProvider();
  }
  return cachedProvider;
}

export type { StorageProvider, StorageGetResult, StoragePutResult } from "./types";
