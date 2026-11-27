-- CreateEnum
CREATE TYPE "LiveQuizMode" AS ENUM ('HOST_PACED', 'SELF_PACED');

-- CreateEnum
CREATE TYPE "LiveQuizStatus" AS ENUM ('LOBBY', 'QUESTION_OPEN', 'QUESTION_CLOSED', 'FINISHED');

-- CreateTable
CREATE TABLE "LiveQuizSession" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "classId" TEXT,
    "worksheetId" TEXT,
    "title" TEXT NOT NULL,
    "pinCode" TEXT NOT NULL,
    "mode" "LiveQuizMode" NOT NULL DEFAULT 'HOST_PACED',
    "status" "LiveQuizStatus" NOT NULL DEFAULT 'LOBBY',
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "questionStartedAt" TIMESTAMP(3),
    "questionLimitSec" INTEGER NOT NULL DEFAULT 30,
    "isExitTicket" BOOLEAN NOT NULL DEFAULT false,
    "questionsSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "LiveQuizSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveQuizParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "joinTokenHash" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveQuizParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveQuizAnswer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "questionIndex" INTEGER NOT NULL,
    "answer" JSONB NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "responseMs" INTEGER NOT NULL,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveQuizAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassBehaviorPreset" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassBehaviorPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentBehaviorPoint" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "presetId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "awardedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentBehaviorPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveQuizSession_pinCode_key" ON "LiveQuizSession"("pinCode");

-- CreateIndex
CREATE INDEX "LiveQuizSession_hostId_createdAt_idx" ON "LiveQuizSession"("hostId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveQuizSession_classId_idx" ON "LiveQuizSession"("classId");

-- CreateIndex
CREATE INDEX "LiveQuizParticipant_sessionId_totalScore_idx" ON "LiveQuizParticipant"("sessionId", "totalScore");

-- CreateIndex
CREATE UNIQUE INDEX "LiveQuizParticipant_sessionId_joinTokenHash_key" ON "LiveQuizParticipant"("sessionId", "joinTokenHash");

-- CreateIndex
CREATE INDEX "LiveQuizAnswer_sessionId_questionIndex_idx" ON "LiveQuizAnswer"("sessionId", "questionIndex");

-- CreateIndex
CREATE UNIQUE INDEX "LiveQuizAnswer_participantId_questionIndex_key" ON "LiveQuizAnswer"("participantId", "questionIndex");

-- CreateIndex
CREATE INDEX "ClassBehaviorPreset_classId_idx" ON "ClassBehaviorPreset"("classId");

-- CreateIndex
CREATE INDEX "StudentBehaviorPoint_classId_studentId_idx" ON "StudentBehaviorPoint"("classId", "studentId");

-- CreateIndex
CREATE INDEX "StudentBehaviorPoint_sessionId_idx" ON "StudentBehaviorPoint"("sessionId");

-- AddForeignKey
ALTER TABLE "LiveQuizSession" ADD CONSTRAINT "LiveQuizSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveQuizSession" ADD CONSTRAINT "LiveQuizSession_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveQuizSession" ADD CONSTRAINT "LiveQuizSession_worksheetId_fkey" FOREIGN KEY ("worksheetId") REFERENCES "Worksheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveQuizParticipant" ADD CONSTRAINT "LiveQuizParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveQuizSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveQuizParticipant" ADD CONSTRAINT "LiveQuizParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveQuizAnswer" ADD CONSTRAINT "LiveQuizAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveQuizSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveQuizAnswer" ADD CONSTRAINT "LiveQuizAnswer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "LiveQuizParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassBehaviorPreset" ADD CONSTRAINT "ClassBehaviorPreset_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBehaviorPoint" ADD CONSTRAINT "StudentBehaviorPoint_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBehaviorPoint" ADD CONSTRAINT "StudentBehaviorPoint_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBehaviorPoint" ADD CONSTRAINT "StudentBehaviorPoint_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBehaviorPoint" ADD CONSTRAINT "StudentBehaviorPoint_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "ClassBehaviorPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBehaviorPoint" ADD CONSTRAINT "StudentBehaviorPoint_awardedById_fkey" FOREIGN KEY ("awardedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
