-- CreateEnum
CREATE TYPE "OmrSheetTemplate" AS ENUM ('MC_20', 'MC_40', 'MC_50', 'THPT_2025');

-- CreateTable
CREATE TABLE "OmrExamSheet" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "title" TEXT NOT NULL,
    "template" "OmrSheetTemplate" NOT NULL,
    "answerKeyByVariant" JSONB NOT NULL,
    "pointsConfig" JSONB NOT NULL,
    "offlineColumnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OmrExamSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OmrScanResult" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "studentId" TEXT,
    "detectedSbd" TEXT,
    "variantCode" TEXT,
    "scanImageKey" TEXT NOT NULL,
    "rawBubbles" JSONB NOT NULL,
    "resolvedAnswers" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OmrScanResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OmrExamSheet_classId_createdAt_idx" ON "OmrExamSheet"("classId", "createdAt");

-- CreateIndex
CREATE INDEX "OmrScanResult_sheetId_createdAt_idx" ON "OmrScanResult"("sheetId", "createdAt");

-- CreateIndex
CREATE INDEX "OmrScanResult_studentId_idx" ON "OmrScanResult"("studentId");

-- AddForeignKey
ALTER TABLE "OmrExamSheet" ADD CONSTRAINT "OmrExamSheet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmrExamSheet" ADD CONSTRAINT "OmrExamSheet_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmrScanResult" ADD CONSTRAINT "OmrScanResult_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "OmrExamSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmrScanResult" ADD CONSTRAINT "OmrScanResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmrScanResult" ADD CONSTRAINT "OmrScanResult_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
