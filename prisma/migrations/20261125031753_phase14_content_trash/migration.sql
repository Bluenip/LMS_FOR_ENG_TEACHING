-- AlterTable
ALTER TABLE "DriveFile" ADD COLUMN     "softTrashedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedSource" TEXT;

-- AlterTable
ALTER TABLE "LessonItem" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedSource" TEXT;

-- AlterTable
ALTER TABLE "Worksheet" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedSource" TEXT;
