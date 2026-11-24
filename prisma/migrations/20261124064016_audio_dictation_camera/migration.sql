-- AlterEnum
ALTER TYPE "FieldType" ADD VALUE 'DICTATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProctorEventType" ADD VALUE 'DROP';
ALTER TYPE "ProctorEventType" ADD VALUE 'PASTE_SUSPECTED';
ALTER TYPE "ProctorEventType" ADD VALUE 'CAMERA_NO_FACE';
ALTER TYPE "ProctorEventType" ADD VALUE 'CAMERA_MULTI_FACE';
ALTER TYPE "ProctorEventType" ADD VALUE 'CAMERA_LOOK_AWAY';
ALTER TYPE "ProctorEventType" ADD VALUE 'CAMERA_PHONE';
ALTER TYPE "ProctorEventType" ADD VALUE 'CAMERA_OFF';

-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "gradeDetail" JSONB;

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "audioBlockPause" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "audioBlockSeek" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "audioMaxPlays" INTEGER,
ADD COLUMN     "cameraEnforce" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cameraSnapshots" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requireCamera" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "maxAttempts" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Field" ADD COLUMN     "audioId" TEXT;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "cameraConsentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WorksheetAudio" (
    "id" TEXT NOT NULL,
    "worksheetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorksheetAudio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioPlay" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "audioId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioPlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorksheetAudio_worksheetId_order_idx" ON "WorksheetAudio"("worksheetId", "order");

-- CreateIndex
CREATE INDEX "AudioPlay_submissionId_audioId_idx" ON "AudioPlay"("submissionId", "audioId");

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "WorksheetAudio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorksheetAudio" ADD CONSTRAINT "WorksheetAudio_worksheetId_fkey" FOREIGN KEY ("worksheetId") REFERENCES "Worksheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioPlay" ADD CONSTRAINT "AudioPlay_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioPlay" ADD CONSTRAINT "AudioPlay_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "WorksheetAudio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
