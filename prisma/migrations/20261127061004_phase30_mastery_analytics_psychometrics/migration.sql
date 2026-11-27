-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "atRiskMissingCount" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "atRiskScoreThreshold" DOUBLE PRECISION NOT NULL DEFAULT 5.0;

-- CreateTable
CREATE TABLE "RemedialPlanLog" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "topicTags" JSONB NOT NULL,
    "targetStudentIds" JSONB NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemedialPlanLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RemedialPlanLog_classId_createdAt_idx" ON "RemedialPlanLog"("classId", "createdAt");

-- AddForeignKey
ALTER TABLE "RemedialPlanLog" ADD CONSTRAINT "RemedialPlanLog_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemedialPlanLog" ADD CONSTRAINT "RemedialPlanLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
