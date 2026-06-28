-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete', 'verify', 'merge', 'split');

-- CreateEnum
CREATE TYPE "AuditReasonType" AS ENUM ('initial_entry', 'source_update', 'source_correction', 'stale_source', 'manual_error', 'format_normalization', 'translation_update', 'verification_update', 'entity_merge', 'entity_split', 'import', 'system');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('admin', 'import_script', 'system');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "fieldName" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reasonType" "AuditReasonType" NOT NULL,
    "reasonNote" TEXT,
    "sourceId" TEXT,
    "actorType" "AuditActorType" NOT NULL DEFAULT 'admin',
    "actorId" TEXT,
    "batchId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_reasonType_idx" ON "AuditLog"("reasonType");

-- CreateIndex
CREATE INDEX "AuditLog_batchId_idx" ON "AuditLog"("batchId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
