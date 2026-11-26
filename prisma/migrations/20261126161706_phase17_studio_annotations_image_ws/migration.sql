-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "annotations" JSONB;

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "shuffleOptions" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Field" ADD COLUMN     "imageKey" TEXT;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "optionOrder" JSONB;

-- AlterTable
ALTER TABLE "WorksheetPage" ADD COLUMN     "imageKey" TEXT;
