-- CreateEnum
CREATE TYPE "WorksheetSubject" AS ENUM ('ENGLISH', 'MATH', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'LITERATURE', 'HISTORY', 'GEOGRAPHY', 'CIVICS', 'INFORMATICS', 'GENERAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FieldType" ADD VALUE 'TRUE_FALSE_GROUP';
ALTER TYPE "FieldType" ADD VALUE 'PHOTO_UPLOAD';

-- AlterTable
ALTER TABLE "Field" ADD COLUMN     "passageId" TEXT;

-- AlterTable
ALTER TABLE "Worksheet" ADD COLUMN     "passages" JSONB,
ADD COLUMN     "subject" "WorksheetSubject" NOT NULL DEFAULT 'GENERAL';

-- CreateIndex
CREATE INDEX "Worksheet_subject_idx" ON "Worksheet"("subject");
