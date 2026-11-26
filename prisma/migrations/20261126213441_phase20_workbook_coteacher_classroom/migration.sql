-- CreateEnum
CREATE TYPE "ClassRole" AS ENUM ('OWNER', 'CO_TEACHER', 'ASSISTANT');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SUBMISSION_RETURNED';

-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'RETURNED';

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "unlockAfterAssignmentId" TEXT,
ADD COLUMN     "workbookId" TEXT,
ADD COLUMN     "workbookOrder" INTEGER;

-- AlterTable
ALTER TABLE "Field" ADD COLUMN     "topicTag" TEXT;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "commentsLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Workbook" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkbookItem" (
    "id" TEXT NOT NULL,
    "workbookId" TEXT NOT NULL,
    "worksheetId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkbookItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionRevision" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "teacherComment" TEXT,
    "answersSnapshot" JSONB NOT NULL,
    "totalScore" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassTeacher" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ClassRole" NOT NULL DEFAULT 'CO_TEACHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassTeacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonItemProgress" (
    "id" TEXT NOT NULL,
    "lessonItemId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LessonItemProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPoll" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "closesAt" TIMESTAMP(3),

    CONSTRAINT "PostPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PostPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPollVote" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostPollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workbook_ownerId_idx" ON "Workbook"("ownerId");

-- CreateIndex
CREATE INDEX "WorkbookItem_workbookId_order_idx" ON "WorkbookItem"("workbookId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "WorkbookItem_workbookId_worksheetId_key" ON "WorkbookItem"("workbookId", "worksheetId");

-- CreateIndex
CREATE INDEX "SubmissionRevision_submissionId_revisionNo_idx" ON "SubmissionRevision"("submissionId", "revisionNo");

-- CreateIndex
CREATE INDEX "ClassTeacher_userId_idx" ON "ClassTeacher"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassTeacher_classId_userId_key" ON "ClassTeacher"("classId", "userId");

-- CreateIndex
CREATE INDEX "LessonItemProgress_studentId_idx" ON "LessonItemProgress"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonItemProgress_lessonItemId_studentId_key" ON "LessonItemProgress"("lessonItemId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PostPoll_postId_key" ON "PostPoll"("postId");

-- CreateIndex
CREATE INDEX "PostPollOption_pollId_order_idx" ON "PostPollOption"("pollId", "order");

-- CreateIndex
CREATE INDEX "PostPollVote_userId_idx" ON "PostPollVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PostPollVote_optionId_userId_key" ON "PostPollVote"("optionId", "userId");

-- CreateIndex
CREATE INDEX "PostReaction_postId_idx" ON "PostReaction"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PostReaction_postId_userId_emoji_key" ON "PostReaction"("postId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "Assignment_workbookId_idx" ON "Assignment"("workbookId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "Workbook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_unlockAfterAssignmentId_fkey" FOREIGN KEY ("unlockAfterAssignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workbook" ADD CONSTRAINT "Workbook_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookItem" ADD CONSTRAINT "WorkbookItem_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "Workbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookItem" ADD CONSTRAINT "WorkbookItem_worksheetId_fkey" FOREIGN KEY ("worksheetId") REFERENCES "Worksheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionRevision" ADD CONSTRAINT "SubmissionRevision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTeacher" ADD CONSTRAINT "ClassTeacher_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTeacher" ADD CONSTRAINT "ClassTeacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonItemProgress" ADD CONSTRAINT "LessonItemProgress_lessonItemId_fkey" FOREIGN KEY ("lessonItemId") REFERENCES "LessonItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonItemProgress" ADD CONSTRAINT "LessonItemProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPoll" ADD CONSTRAINT "PostPoll_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPollOption" ADD CONSTRAINT "PostPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "PostPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPollVote" ADD CONSTRAINT "PostPollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PostPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPollVote" ADD CONSTRAINT "PostPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
