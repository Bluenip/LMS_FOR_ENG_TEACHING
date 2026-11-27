-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "examSessionId" TEXT;

-- AlterTable
ALTER TABLE "Field" ADD COLUMN     "bankItemId" TEXT;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "examVariantId" TEXT;

-- CreateTable
CREATE TABLE "QuestionBankItem" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "subject" "WorksheetSubject" NOT NULL DEFAULT 'GENERAL',
    "type" "FieldType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB,
    "answerKey" JSONB NOT NULL,
    "explanation" TEXT,
    "rubric" JSONB,
    "skillTag" "SkillTag",
    "topicTag" TEXT,
    "level" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 3,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audioKey" TEXT,
    "imageKey" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionBankItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamVariant" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "questionOrder" JSONB NOT NULL,
    "optionOrder" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "worksheetId" TEXT NOT NULL,
    "openAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "timeLimitMin" INTEGER,
    "proctorConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionBankItem_ownerId_subject_idx" ON "QuestionBankItem"("ownerId", "subject");

-- CreateIndex
CREATE INDEX "QuestionBankItem_isShared_subject_idx" ON "QuestionBankItem"("isShared", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "ExamVariant_assignmentId_code_key" ON "ExamVariant"("assignmentId", "code");

-- CreateIndex
CREATE INDEX "ExamSession_ownerId_idx" ON "ExamSession"("ownerId");

-- CreateIndex
CREATE INDEX "Assignment_examSessionId_idx" ON "Assignment"("examSessionId");

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_bankItemId_fkey" FOREIGN KEY ("bankItemId") REFERENCES "QuestionBankItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_examVariantId_fkey" FOREIGN KEY ("examVariantId") REFERENCES "ExamVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamVariant" ADD CONSTRAINT "ExamVariant_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_worksheetId_fkey" FOREIGN KEY ("worksheetId") REFERENCES "Worksheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
