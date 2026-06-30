-- CreateTable
CREATE TABLE "PlayerRelationCache" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRelationCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRelationCache_personId_key" ON "PlayerRelationCache"("personId");

-- CreateIndex
CREATE INDEX "PlayerRelationCache_generatedAt_idx" ON "PlayerRelationCache"("generatedAt");

-- AddForeignKey
ALTER TABLE "PlayerRelationCache" ADD CONSTRAINT "PlayerRelationCache_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
