-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "allowedTools" JSONB,
ADD COLUMN     "isGroupAssignment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "peerReviewEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "peerReviewsPerStudent" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "memberScoreOverrides" JSONB;

-- CreateTable
CREATE TABLE "LessonVideoCheckpoint" (
    "id" TEXT NOT NULL,
    "lessonItemId" TEXT NOT NULL,
    "timestampSec" INTEGER NOT NULL,
    "type" "FieldType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB,
    "answerKey" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonVideoCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonVideoProgress" (
    "id" TEXT NOT NULL,
    "lessonItemId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "maxWatchedSec" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "checkpointAnswers" JSONB,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonVideoProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassGroup" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassGroupMember" (
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "isLeader" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClassGroupMember_pkey" PRIMARY KEY ("groupId","studentId")
);

-- CreateTable
CREATE TABLE "PeerReviewAssignment" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "rubricScores" JSONB,
    "comment" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeerReviewAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionDoubt" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "teacherReply" TEXT,
    "repliedById" TEXT,
    "repliedAt" TIMESTAMP(3),
    "isPublicToClass" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionDoubt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonVideoCheckpoint_lessonItemId_timestampSec_idx" ON "LessonVideoCheckpoint"("lessonItemId", "timestampSec");

-- CreateIndex
CREATE UNIQUE INDEX "LessonVideoProgress_lessonItemId_studentId_key" ON "LessonVideoProgress"("lessonItemId", "studentId");

-- CreateIndex
CREATE INDEX "ClassGroup_classId_idx" ON "ClassGroup"("classId");

-- CreateIndex
CREATE INDEX "ClassGroupMember_studentId_idx" ON "ClassGroupMember"("studentId");

-- CreateIndex
CREATE INDEX "PeerReviewAssignment_assignmentId_reviewerId_idx" ON "PeerReviewAssignment"("assignmentId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "PeerReviewAssignment_submissionId_reviewerId_key" ON "PeerReviewAssignment"("submissionId", "reviewerId");

-- CreateIndex
CREATE INDEX "QuestionDoubt_assignmentId_fieldId_idx" ON "QuestionDoubt"("assignmentId", "fieldId");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ClassGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonVideoCheckpoint" ADD CONSTRAINT "LessonVideoCheckpoint_lessonItemId_fkey" FOREIGN KEY ("lessonItemId") REFERENCES "LessonItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonVideoProgress" ADD CONSTRAINT "LessonVideoProgress_lessonItemId_fkey" FOREIGN KEY ("lessonItemId") REFERENCES "LessonItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonVideoProgress" ADD CONSTRAINT "LessonVideoProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroupMember" ADD CONSTRAINT "ClassGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ClassGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroupMember" ADD CONSTRAINT "ClassGroupMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerReviewAssignment" ADD CONSTRAINT "PeerReviewAssignment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerReviewAssignment" ADD CONSTRAINT "PeerReviewAssignment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerReviewAssignment" ADD CONSTRAINT "PeerReviewAssignment_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDoubt" ADD CONSTRAINT "QuestionDoubt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDoubt" ADD CONSTRAINT "QuestionDoubt_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDoubt" ADD CONSTRAINT "QuestionDoubt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDoubt" ADD CONSTRAINT "QuestionDoubt_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
