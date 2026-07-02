import type { PrismaClient } from "@prisma/client";

export async function bumpCacheInvalidationScope(prisma: PrismaClient, scope: string) {
  if (!("cacheInvalidation" in prisma) || !prisma.cacheInvalidation) {
    return;
  }

  try {
    await prisma.cacheInvalidation.upsert({
      where: { scope },
      update: {
        version: new Date(),
      },
      create: {
        scope,
        version: new Date(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("CacheInvalidation")) {
      return;
    }

    throw error;
  }
}
