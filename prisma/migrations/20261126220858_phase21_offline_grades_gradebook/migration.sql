-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "attachmentKeys" JSONB,
ADD COLUMN     "isQuickTextbook" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promptText" TEXT;

-- CreateTable
CREATE TABLE "OfflineGradeColumn" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineGradeColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineGradeEntry" (
    "id" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineGradeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfflineGradeColumn_classId_date_idx" ON "OfflineGradeColumn"("classId", "date");

-- CreateIndex
CREATE INDEX "OfflineGradeEntry_studentId_idx" ON "OfflineGradeEntry"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineGradeEntry_columnId_studentId_key" ON "OfflineGradeEntry"("columnId", "studentId");

-- AddForeignKey
ALTER TABLE "OfflineGradeColumn" ADD CONSTRAINT "OfflineGradeColumn_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineGradeColumn" ADD CONSTRAINT "OfflineGradeColumn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineGradeEntry" ADD CONSTRAINT "OfflineGradeEntry_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "OfflineGradeColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineGradeEntry" ADD CONSTRAINT "OfflineGradeEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
