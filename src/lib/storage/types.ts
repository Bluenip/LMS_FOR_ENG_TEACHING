export interface StoragePutResult {
  key: string;
  size: number;
  contentType: string;
}

export interface StorageGetResult {
  buffer: Buffer;
  contentType: string;
  size: number;
}

export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<StoragePutResult>;
  get(key: string): Promise<StorageGetResult | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getSignedUrl?(key: string, expiresInSec?: number): Promise<string>;
}
