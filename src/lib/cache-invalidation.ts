import { prisma } from "@/lib/prisma";
import { getCachedValue } from "@/lib/server-cache";

const VERSION_CACHE_TTL_MS = 1000 * 15;

async function loadScopeVersion(scope: string) {
  try {
    const row = await prisma.cacheInvalidation.findUnique({
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
