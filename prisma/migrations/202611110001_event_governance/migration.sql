-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "governance";

-- AlterEnum
ALTER TYPE "OrganizationType" ADD VALUE 'unknown';

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "dateEvidence" JSONB,
ADD COLUMN     "exclusivityGroup" TEXT,
ADD COLUMN     "endDateBasis" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "endState" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "startDateBasis" TEXT NOT NULL DEFAULT 'unknown';

-- CreateTable
CREATE TABLE "governance"."EventImportTask" (
    "id" UUID NOT NULL,
    "requestKey" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "inputManifest" JSONB NOT NULL,
    "summary" JSONB,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),
    "heartbeatAt" TIMESTAMPTZ(3),
    "nextRunAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "EventImportTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance"."GovernanceBatch" (
    "id" UUID NOT NULL,
    "eventTaskId" UUID NOT NULL,
    "unitType" TEXT NOT NULL,
    "unitKey" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "rawPayloadRef" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payloadBytes" INTEGER NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "summary" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "GovernanceBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance"."BatchAttempt" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "graphThreadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "inputFingerprint" TEXT NOT NULL,
    "metrics" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "BatchAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance"."AgentExecution" (
    "id" UUID NOT NULL,
    "batchAttemptId" UUID NOT NULL,
    "agentKey" TEXT NOT NULL,
    "executionNo" INTEGER NOT NULL DEFAULT 1,
    "agentVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "currentNode" TEXT,
    "resultSummary" JSONB,
    "evidenceRefs" JSONB,
    "metrics" JSONB,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance"."GovernanceFinding" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "agentExecutionId" UUID,
    "findingKey" TEXT NOT NULL,
    "findingCode" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "resolutionStatus" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "detailsAndEvidence" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovernanceFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance"."GovernanceChange" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "proposedByExecutionId" UUID,
    "changeKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "entityRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "patchAndEvidence" JSONB NOT NULL,
    "businessAuditRef" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMPTZ(3),

    CONSTRAINT "GovernanceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance"."NotificationDelivery" (
    "id" UUID NOT NULL,
    "eventTaskId" UUID,
    "batchId" UUID,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventImportTask_requestKey_key" ON "governance"."EventImportTask"("requestKey");

-- CreateIndex
CREATE INDEX "EventImportTask_status_nextRunAt_leaseUntil_idx" ON "governance"."EventImportTask"("status", "nextRunAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "GovernanceBatch_eventTaskId_status_idx" ON "governance"."GovernanceBatch"("eventTaskId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceBatch_eventTaskId_unitType_unitKey_key" ON "governance"."GovernanceBatch"("eventTaskId", "unitType", "unitKey");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceBatch_eventTaskId_sequence_key" ON "governance"."GovernanceBatch"("eventTaskId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "BatchAttempt_graphThreadId_key" ON "governance"."BatchAttempt"("graphThreadId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchAttempt_batchId_attemptNo_key" ON "governance"."BatchAttempt"("batchId", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "AgentExecution_batchAttemptId_agentKey_executionNo_key" ON "governance"."AgentExecution"("batchAttemptId", "agentKey", "executionNo");

-- CreateIndex
CREATE INDEX "GovernanceFinding_severity_resolutionStatus_idx" ON "governance"."GovernanceFinding"("severity", "resolutionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceFinding_batchId_findingKey_key" ON "governance"."GovernanceFinding"("batchId", "findingKey");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceChange_idempotencyKey_key" ON "governance"."GovernanceChange"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GovernanceChange_batchId_entityRef_status_idx" ON "governance"."GovernanceChange"("batchId", "entityRef", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceChange_batchId_changeKey_revision_key" ON "governance"."GovernanceChange"("batchId", "changeKey", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_dedupeKey_key" ON "governance"."NotificationDelivery"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "governance"."NotificationDelivery"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "governance"."GovernanceBatch" ADD CONSTRAINT "GovernanceBatch_eventTaskId_fkey" FOREIGN KEY ("eventTaskId") REFERENCES "governance"."EventImportTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance"."BatchAttempt" ADD CONSTRAINT "BatchAttempt_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "governance"."GovernanceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance"."AgentExecution" ADD CONSTRAINT "AgentExecution_batchAttemptId_fkey" FOREIGN KEY ("batchAttemptId") REFERENCES "governance"."BatchAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance"."GovernanceFinding" ADD CONSTRAINT "GovernanceFinding_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "governance"."GovernanceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance"."GovernanceFinding" ADD CONSTRAINT "GovernanceFinding_agentExecutionId_fkey" FOREIGN KEY ("agentExecutionId") REFERENCES "governance"."AgentExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance"."GovernanceChange" ADD CONSTRAINT "GovernanceChange_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "governance"."GovernanceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance"."GovernanceChange" ADD CONSTRAINT "GovernanceChange_proposedByExecutionId_fkey" FOREIGN KEY ("proposedByExecutionId") REFERENCES "governance"."AgentExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance"."NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_eventTaskId_fkey" FOREIGN KEY ("eventTaskId") REFERENCES "governance"."EventImportTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance"."NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "governance"."GovernanceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Application catalogs remain extensible; lifecycle and ownership are database invariants.
ALTER TABLE "governance"."EventImportTask" ADD CONSTRAINT "event_mode" CHECK (mode IN ('dry_run','apply')),
 ADD CONSTRAINT "event_status" CHECK (status IN ('queued','running','completed','completed_with_unresolved','failed'));
ALTER TABLE "governance"."GovernanceBatch" ADD CONSTRAINT "batch_status" CHECK (status IN ('queued','running','completed','completed_with_unresolved','partial','failed')),
 ADD CONSTRAINT "batch_sequence" CHECK (sequence >= 0), ADD CONSTRAINT "batch_unit" CHECK ("unitType" IN ('leg','heat','group'));
ALTER TABLE "governance"."BatchAttempt" ADD CONSTRAINT "attempt_status" CHECK (status IN ('running','succeeded','partial','failed','superseded'));
ALTER TABLE "governance"."AgentExecution" ADD CONSTRAINT "execution_status" CHECK (status IN ('running','succeeded','skipped','partial','failed'));
ALTER TABLE "governance"."GovernanceFinding" ADD CONSTRAINT "finding_status" CHECK ("resolutionStatus" IN ('resolved','unresolved','informational')),
 ADD CONSTRAINT "finding_severity" CHECK (severity IN ('info','warning','serious'));
ALTER TABLE "governance"."GovernanceChange" ADD CONSTRAINT "change_status" CHECK (status IN ('planned','applying','applied','failed','superseded'));
ALTER TABLE "governance"."NotificationDelivery" ADD CONSTRAINT "notification_owner" CHECK (("eventTaskId" IS NULL) <> ("batchId" IS NULL)),
 ADD CONSTRAINT "notification_status" CHECK (status IN ('pending','sending','sent','failed'));
ALTER TABLE "public"."Membership" ADD CONSTRAINT "membership_start_basis" CHECK ("startDateBasis" IN ('unknown','source','inferred')),
 ADD CONSTRAINT "membership_end_basis" CHECK ("endDateBasis" IN ('unknown','source','inferred')),
 ADD CONSTRAINT "membership_end_state" CHECK ("endState" IN ('unknown','ongoing','ended'));
