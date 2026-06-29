-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "SourceReference" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityKey" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "personId" TEXT,
    "organizationId" TEXT,
    "competitionId" TEXT,
    "competitionEditionId" TEXT,
    "raceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'pending',
    "sourceId" TEXT,
    "summary" TEXT,
    "payload" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceReference_personId_idx" ON "SourceReference"("personId");

-- CreateIndex
CREATE INDEX "SourceReference_organizationId_idx" ON "SourceReference"("organizationId");

-- CreateIndex
CREATE INDEX "SourceReference_competitionId_idx" ON "SourceReference"("competitionId");

-- CreateIndex
CREATE INDEX "SourceReference_competitionEditionId_idx" ON "SourceReference"("competitionEditionId");

-- CreateIndex
CREATE INDEX "SourceReference_raceId_idx" ON "SourceReference"("raceId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceReference_sourceId_sourceEntityType_sourceEntityKey_key" ON "SourceReference"("sourceId", "sourceEntityType", "sourceEntityKey");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_key_key" ON "ImportBatch"("key");

-- CreateIndex
CREATE INDEX "ImportBatch_type_idx" ON "ImportBatch"("type");

-- CreateIndex
CREATE INDEX "ImportBatch_status_idx" ON "ImportBatch"("status");

-- CreateIndex
CREATE INDEX "ImportBatch_createdAt_idx" ON "ImportBatch"("createdAt");

-- AddForeignKey
ALTER TABLE "SourceReference" ADD CONSTRAINT "SourceReference_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceReference" ADD CONSTRAINT "SourceReference_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceReference" ADD CONSTRAINT "SourceReference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceReference" ADD CONSTRAINT "SourceReference_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceReference" ADD CONSTRAINT "SourceReference_competitionEditionId_fkey" FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceReference" ADD CONSTRAINT "SourceReference_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
