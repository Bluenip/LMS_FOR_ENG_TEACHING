-- CreateTable
CREATE TABLE "AiGradingSuggestion" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "suggestedScore" DOUBLE PRECISION NOT NULL,
    "suggestedRubricScores" JSONB,
    "suggestedComment" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGradingSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimilarityReport" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "submissionAId" TEXT NOT NULL,
    "submissionBId" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "matchedSpans" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimilarityReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiGradingSuggestion_submissionId_fieldId_key" ON "AiGradingSuggestion"("submissionId", "fieldId");

-- CreateIndex
CREATE INDEX "SimilarityReport_assignmentId_similarity_idx" ON "SimilarityReport"("assignmentId", "similarity");

-- CreateIndex
CREATE UNIQUE INDEX "SimilarityReport_assignmentId_fieldId_submissionAId_submiss_key" ON "SimilarityReport"("assignmentId", "fieldId", "submissionAId", "submissionBId");

-- AddForeignKey
ALTER TABLE "AiGradingSuggestion" ADD CONSTRAINT "AiGradingSuggestion_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGradingSuggestion" ADD CONSTRAINT "AiGradingSuggestion_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGradingSuggestion" ADD CONSTRAINT "AiGradingSuggestion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimilarityReport" ADD CONSTRAINT "SimilarityReport_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimilarityReport" ADD CONSTRAINT "SimilarityReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
