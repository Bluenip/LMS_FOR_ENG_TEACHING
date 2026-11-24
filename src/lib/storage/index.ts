import { DriveStorageProvider } from "./drive";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

let cachedDriver: string | null = null;
let cachedProvider: StorageProvider | null = null;

export function getActiveStorageDriver(): "local" | "s3" | "drive" {
  const raw = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  if (raw === "drive") return "drive";
  if (raw === "s3") return "s3";
  return "local";
}

export function resetStorageProviderCache(): void {
  cachedDriver = null;
  cachedProvider = null;
}

export function getStorageProvider(): StorageProvider {
  const driver = getActiveStorageDriver();
  if (cachedProvider && cachedDriver === driver) {
    return cachedProvider;
  }
  cachedDriver = driver;
  if (driver === "drive") {
    cachedProvider = new DriveStorageProvider();
  } else if (driver === "s3") {
    cachedProvider = new S3StorageProvider();
  } else {
    cachedProvider = new LocalStorageProvider();
  }
  return cachedProvider;
}

export type {
  DriveFileKindValue,
  StorageGetResult,
  StorageProvider,
  StoragePutOptions,
  StoragePutResult,
  StorageStreamResult,
} from "./types";
