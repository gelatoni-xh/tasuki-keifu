import { createLogger } from "@/lib/logger";

type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
};

const globalForServerCache = globalThis as typeof globalThis & {
  __tasukiServerCache?: Map<string, CacheEntry<unknown>>;
};

const cacheLogger = createLogger("server-cache");
const cacheStore = globalForServerCache.__tasukiServerCache ?? new Map<string, CacheEntry<unknown>>();

if (!globalForServerCache.__tasukiServerCache) {
  globalForServerCache.__tasukiServerCache = cacheStore;
}

export async function getCachedValue<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = cacheStore.get(key) as CacheEntry<T> | undefined;
  const cacheNamespace = getCacheNamespace(key);

  if (existing && existing.value !== undefined && existing.expiresAt > now) {
    cacheLogger.info("cache_hit", {
      cache_key: key,
      cache_namespace: cacheNamespace,
      cache_backend: "memory",
      ttl_ms: ttlMs,
    });
    return existing.value;
  }

  if (existing?.promise) {
    cacheLogger.info("cache_hit", {
      cache_key: key,
      cache_namespace: cacheNamespace,
      cache_backend: "memory",
      cache_state: "in_flight",
      ttl_ms: ttlMs,
    });
    return existing.promise;
  }

  if (existing?.value !== undefined) {
    cacheLogger.info("cache_stale", {
      cache_key: key,
      cache_namespace: cacheNamespace,
      cache_backend: "memory",
      ttl_ms: ttlMs,
    });
  } else {
    cacheLogger.info("cache_miss", {
      cache_key: key,
      cache_namespace: cacheNamespace,
      cache_backend: "memory",
      ttl_ms: ttlMs,
    });
  }

  const loadStartedAt = Date.now();

  const promise = loader()
    .then((value) => {
      cacheStore.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });

      cacheLogger.info("cache_set", {
        cache_key: key,
        cache_namespace: cacheNamespace,
        cache_backend: "memory",
        ttl_ms: ttlMs,
        duration_ms: Date.now() - loadStartedAt,
      });

      return value;
    })
    .catch((error) => {
      cacheStore.delete(key);
      cacheLogger.error("cache_loader_failed", {
        cache_key: key,
        cache_namespace: cacheNamespace,
        cache_backend: "memory",
        ttl_ms: ttlMs,
        duration_ms: Date.now() - loadStartedAt,
        error,
      });
      throw error;
    });

  cacheStore.set(key, {
    expiresAt: now + ttlMs,
    promise,
  });

  return promise;
}

export function clearCachedValue(key: string) {
  cacheStore.delete(key);
}

export function clearCachedValuesByPrefix(prefix: string) {
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
}

function getCacheNamespace(key: string) {
  const segments = key.split(":").filter(Boolean);

  if (segments.length >= 2) {
    return `${segments[0]}:${segments[1]}`;
  }

  return segments[0] ?? "unknown";
}
