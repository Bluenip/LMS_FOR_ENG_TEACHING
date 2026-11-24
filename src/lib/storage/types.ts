export type DriveFileKindValue =
  | "WORKSHEET_PDF"
  | "WORKSHEET_AUDIO"
  | "WORD_SOURCE"
  | "BACKUP"
  | "LESSON_FILE"
  | "SUBMISSION_FILE";

export interface StoragePutOptions {
  ownerId?: string;
  kind?: DriveFileKindValue;
  worksheetId?: string;
  classId?: string;
  submissionId?: string;
  fileName?: string;
  /** Explicit teacher / folder metadata overrides (optional; resolved from DB if omitted). */
  teacherName?: string;
  worksheetTitle?: string;
  className?: string;
  assignmentTitle?: string;
  studentName?: string;
}

export interface StoragePutResult {
  key: string;
  size: number;
  contentType: string;
  driver?: "local" | "s3" | "drive";
  driveFileId?: string;
}

export interface StorageGetResult {
  buffer: Buffer;
  contentType: string;
  size: number;
}

export interface StorageStreamResult {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  status: 200 | 206;
  contentLength?: number;
  contentRange?: string;
}

export interface StorageProvider {
  put(
    key: string,
    data: Buffer,
    contentType: string,
    options?: StoragePutOptions
  ): Promise<StoragePutResult>;
  get(key: string): Promise<StorageGetResult | null>;
  getStream?(key: string, range?: string | null): Promise<StorageStreamResult | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getSignedUrl?(key: string, expiresInSec?: number): Promise<string>;
}
