-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FieldType" ADD VALUE 'MATCH';
ALTER TYPE "FieldType" ADD VALUE 'DRAG_DROP';
ALTER TYPE "FieldType" ADD VALUE 'SPEAKING';
ALTER TYPE "FieldType" ADD VALUE 'VOICE_ANSWER';
ALTER TYPE "FieldType" ADD VALUE 'HIGHLIGHT';
ALTER TYPE "FieldType" ADD VALUE 'ORDERING';
ALTER TYPE "FieldType" ADD VALUE 'WORDSEARCH';
ALTER TYPE "FieldType" ADD VALUE 'DRAW';
ALTER TYPE "FieldType" ADD VALUE 'CODE';
