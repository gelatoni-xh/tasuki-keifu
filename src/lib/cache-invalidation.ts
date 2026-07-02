import { prisma } from "@/lib/prisma";
import { getCachedValue } from "@/lib/server-cache";

const VERSION_CACHE_TTL_MS = 1000 * 15;

async function loadScopeVersion(scope: string) {
  const cacheInvalidation = (prisma as typeof prisma & {
    cacheInvalidation?: {
      findUnique: (args: {
        where: { scope: string };
        select: { version: true };
      }) => Promise<{ version: Date } | null>;
    };
  }).cacheInvalidation;

  if (!cacheInvalidation) {
    return "0";
  }

  try {
    const row = await cacheInvalidation.findUnique({
      where: { scope },
      select: { version: true },
    });

    return row?.version.toISOString() ?? "0";
  } catch {
    // The table may not exist before the migration is applied. Fall back to plain TTL caching.
    return "0";
  }
}

export async function getScopeVersion(scope: string) {
  return getCachedValue(`cache-scope-version:${scope}`, VERSION_CACHE_TTL_MS, () => loadScopeVersion(scope));
}
