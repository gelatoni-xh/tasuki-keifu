type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
};

const globalForServerCache = globalThis as typeof globalThis & {
  __tasukiServerCache?: Map<string, CacheEntry<unknown>>;
};

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

  if (existing && existing.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }

  if (existing?.promise) {
    return existing.promise;
  }

  const promise = loader()
    .then((value) => {
      cacheStore.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });

      return value;
    })
    .catch((error) => {
      cacheStore.delete(key);
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
