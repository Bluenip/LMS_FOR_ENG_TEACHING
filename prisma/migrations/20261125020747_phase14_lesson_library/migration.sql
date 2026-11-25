-- DropForeignKey
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_classId_fkey";

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "ownerId" TEXT,
ALTER COLUMN "classId" DROP NOT NULL,
ALTER COLUMN "order" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "ClassLesson" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassLesson_classId_order_idx" ON "ClassLesson"("classId", "order");

-- CreateIndex
CREATE INDEX "ClassLesson_lessonId_idx" ON "ClassLesson"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassLesson_classId_lessonId_key" ON "ClassLesson"("classId", "lessonId");

-- CreateIndex
CREATE INDEX "Lesson_ownerId_updatedAt_idx" ON "Lesson"("ownerId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassLesson" ADD CONSTRAINT "ClassLesson_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassLesson" ADD CONSTRAINT "ClassLesson_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing lesson belongs to its class teacher's library and stays shown in its class
UPDATE "Lesson" AS l
SET "ownerId" = c."teacherId"
FROM "Class" AS c
WHERE l."classId" = c."id" AND l."ownerId" IS NULL;

INSERT INTO "ClassLesson" ("id", "classId", "lessonId", "order", "createdAt")
SELECT 'cl_' || l."id", l."classId", l."id", l."order", l."createdAt"
FROM "Lesson" AS l
WHERE l."classId" IS NOT NULL
ON CONFLICT ("classId", "lessonId") DO NOTHING;
