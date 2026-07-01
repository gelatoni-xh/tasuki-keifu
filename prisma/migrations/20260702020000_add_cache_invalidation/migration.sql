CREATE TABLE "CacheInvalidation" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "version" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CacheInvalidation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CacheInvalidation_scope_key" ON "CacheInvalidation"("scope");
