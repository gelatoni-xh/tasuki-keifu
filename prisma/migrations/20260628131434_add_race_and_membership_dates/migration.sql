/*
  Warnings:

  - You are about to drop the column `competitionEditionId` on the `RaceResult` table. All the data in the column will be lost.
  - You are about to drop the column `discipline` on the `RaceResult` table. All the data in the column will be lost.
  - You are about to drop the column `leg` on the `RaceResult` table. All the data in the column will be lost.
  - You are about to drop the column `legRank` on the `RaceResult` table. All the data in the column will be lost.
  - Added the required column `raceId` to the `RaceResult` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RaceResult" DROP CONSTRAINT "RaceResult_competitionEditionId_fkey";

-- DropIndex
DROP INDEX "RaceResult_competitionEditionId_idx";

-- DropIndex
DROP INDEX "RaceResult_leg_idx";

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RaceResult" DROP COLUMN "competitionEditionId",
DROP COLUMN "discipline",
DROP COLUMN "leg",
DROP COLUMN "legRank",
ADD COLUMN     "raceId" TEXT NOT NULL,
ADD COLUMN     "rank" INTEGER;

-- CreateTable
CREATE TABLE "Race" (
    "id" TEXT NOT NULL,
    "competitionEditionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discipline" "EventDiscipline" NOT NULL,
    "leg" INTEGER,
    "round" TEXT,
    "heat" TEXT,
    "distanceMeters" INTEGER,
    "startsAt" TIMESTAMP(3),
    "status" "DataStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Race_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Race_slug_key" ON "Race"("slug");

-- CreateIndex
CREATE INDEX "Race_competitionEditionId_idx" ON "Race"("competitionEditionId");

-- CreateIndex
CREATE INDEX "Race_discipline_idx" ON "Race"("discipline");

-- CreateIndex
CREATE INDEX "Race_leg_idx" ON "Race"("leg");

-- CreateIndex
CREATE INDEX "Membership_startDate_idx" ON "Membership"("startDate");

-- CreateIndex
CREATE INDEX "Membership_endDate_idx" ON "Membership"("endDate");

-- CreateIndex
CREATE INDEX "RaceResult_raceId_idx" ON "RaceResult"("raceId");

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_competitionEditionId_fkey" FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE CASCADE ON UPDATE CASCADE;
