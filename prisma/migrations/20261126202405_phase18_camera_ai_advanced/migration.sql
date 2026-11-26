-- CreateEnum
CREATE TYPE "CameraSensitivity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProctorEventType" ADD VALUE 'CAMERA_GAZE_AWAY';
ALTER TYPE "ProctorEventType" ADD VALUE 'MIC_VOICE';
ALTER TYPE "ProctorEventType" ADD VALUE 'MOBILE_APP_SWITCH';

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "cameraCountLookAway" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cameraSensitivity" "CameraSensitivity" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "requireMicMonitor" BOOLEAN NOT NULL DEFAULT false;
