-- CreateEnum
CREATE TYPE "DriveConnectionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "DriveFileKind" AS ENUM ('WORKSHEET_PDF', 'WORKSHEET_AUDIO', 'WORD_SOURCE', 'BACKUP', 'LESSON_FILE', 'SUBMISSION_FILE');

-- CreateEnum
CREATE TYPE "DriveUploadStatus" AS ENUM ('PENDING', 'UPLOADING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "LessonItem" ADD COLUMN     "driveFileId" TEXT;

-- AlterTable
ALTER TABLE "Worksheet" ADD COLUMN     "lastDriveBackupAt" TIMESTAMP(3),
ADD COLUMN     "lastDriveBackupFileId" TEXT;

-- CreateTable
CREATE TABLE "DriveConnection" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "ownerId" TEXT,
    "connectedById" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "DriveConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "rootFolderId" TEXT,
    "allowPublicLessonVideos" BOOLEAN NOT NULL DEFAULT false,
    "autoBackupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastAutoBackupAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveFile" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "md5" TEXT,
    "kind" "DriveFileKind" NOT NULL,
    "worksheetId" TEXT,
    "classId" TEXT,
    "submissionId" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "trashedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveUpload" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "lessonId" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'video',
    "status" "DriveUploadStatus" NOT NULL DEFAULT 'PENDING',
    "bytesUploaded" INTEGER NOT NULL DEFAULT 0,
    "encryptedSessionUri" TEXT,
    "driveFileId" TEXT,
    "storageKey" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveTrash" (
    "id" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "connectionId" TEXT,
    "storageKey" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveTrash_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriveConnection_scopeKey_key" ON "DriveConnection"("scopeKey");

-- CreateIndex
CREATE INDEX "DriveConnection_ownerId_status_idx" ON "DriveConnection"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DriveFile_storageKey_key" ON "DriveFile"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "DriveFile_driveFileId_key" ON "DriveFile"("driveFileId");

-- CreateIndex
CREATE INDEX "DriveFile_connectionId_kind_idx" ON "DriveFile"("connectionId", "kind");

-- CreateIndex
CREATE INDEX "DriveFile_ownerId_kind_idx" ON "DriveFile"("ownerId", "kind");

-- CreateIndex
CREATE INDEX "DriveFile_worksheetId_idx" ON "DriveFile"("worksheetId");

-- CreateIndex
CREATE INDEX "DriveFile_classId_idx" ON "DriveFile"("classId");

-- CreateIndex
CREATE INDEX "DriveFile_submissionId_idx" ON "DriveFile"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "DriveUpload_driveFileId_key" ON "DriveUpload"("driveFileId");

-- CreateIndex
CREATE INDEX "DriveUpload_ownerId_status_idx" ON "DriveUpload"("ownerId", "status");

-- CreateIndex
CREATE INDEX "DriveUpload_classId_status_idx" ON "DriveUpload"("classId", "status");

-- CreateIndex
CREATE INDEX "DriveUpload_lessonId_idx" ON "DriveUpload"("lessonId");

-- CreateIndex
CREATE INDEX "DriveTrash_connectionId_idx" ON "DriveTrash"("connectionId");

-- CreateIndex
CREATE INDEX "DriveTrash_createdAt_idx" ON "DriveTrash"("createdAt");

-- AddForeignKey
ALTER TABLE "DriveConnection" ADD CONSTRAINT "DriveConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveConnection" ADD CONSTRAINT "DriveConnection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "DriveConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_worksheetId_fkey" FOREIGN KEY ("worksheetId") REFERENCES "Worksheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveUpload" ADD CONSTRAINT "DriveUpload_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "DriveConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveUpload" ADD CONSTRAINT "DriveUpload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveUpload" ADD CONSTRAINT "DriveUpload_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveUpload" ADD CONSTRAINT "DriveUpload_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveTrash" ADD CONSTRAINT "DriveTrash_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "DriveConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
