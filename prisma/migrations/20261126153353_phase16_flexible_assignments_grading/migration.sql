-- CreateEnum
CREATE TYPE "ScoreScale" AS ENUM ('SCALE_10', 'SCALE_100', 'IELTS', 'RAW');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DUE_REMINDER';

-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "rubricScores" JSONB;

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "remindBeforeDue" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "scoreScale" "ScoreScale" NOT NULL DEFAULT 'SCALE_10',
ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Field" ADD COLUMN     "rubric" JSONB;

-- CreateTable
CREATE TABLE "AssignmentOverride" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "extraAttempts" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "timeLimitMin" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentTarget" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentReminderSent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentReminderSent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherCommentPreset" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "category" TEXT,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherCommentPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentOverride_studentId_idx" ON "AssignmentOverride"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentOverride_assignmentId_studentId_key" ON "AssignmentOverride"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "AssignmentTarget_studentId_idx" ON "AssignmentTarget"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentTarget_assignmentId_studentId_key" ON "AssignmentTarget"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "AssignmentReminderSent_assignmentId_idx" ON "AssignmentReminderSent"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentReminderSent_assignmentId_studentId_key" ON "AssignmentReminderSent"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "TeacherCommentPreset_teacherId_order_idx" ON "TeacherCommentPreset"("teacherId", "order");

-- AddForeignKey
ALTER TABLE "AssignmentOverride" ADD CONSTRAINT "AssignmentOverride_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentOverride" ADD CONSTRAINT "AssignmentOverride_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentTarget" ADD CONSTRAINT "AssignmentTarget_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentTarget" ADD CONSTRAINT "AssignmentTarget_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentReminderSent" ADD CONSTRAINT "AssignmentReminderSent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentReminderSent" ADD CONSTRAINT "AssignmentReminderSent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCommentPreset" ADD CONSTRAINT "TeacherCommentPreset_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
