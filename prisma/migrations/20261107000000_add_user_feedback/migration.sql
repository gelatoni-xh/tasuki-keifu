CREATE TABLE "UserFeedback" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "submissionKey" TEXT NOT NULL,
 "payload" JSONB NOT NULL,
 "clientKey" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "notificationStatus" TEXT NOT NULL DEFAULT 'pending',
 "notificationAttempts" INTEGER NOT NULL DEFAULT 0,
 "notificationSentAt" TIMESTAMP(3),
 "notificationLastError" TEXT
);
CREATE UNIQUE INDEX "UserFeedback_submissionKey_key" ON "UserFeedback"("submissionKey");
CREATE INDEX "UserFeedback_clientKey_createdAt_idx" ON "UserFeedback"("clientKey", "createdAt");
CREATE INDEX "UserFeedback_createdAt_idx" ON "UserFeedback"("createdAt");
CREATE INDEX "UserFeedback_notificationStatus_createdAt_idx" ON "UserFeedback"("notificationStatus", "createdAt");
