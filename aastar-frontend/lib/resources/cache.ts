/**
 * localStorage cache utility with TTL — ported from the registry app.
 *
 * Client-side only (touches localStorage at call time, not at module load,
 * so it is safe to import from client components). Used by the operations
 * portal resource pre-check to cache positive on-chain lookups.
 *
 * @module lib/resources/cache
 */

const CACHE_PREFIX = "spm_";
const DEFAULT_TTL = 3600; // 1 hour, in seconds

export interface CachedData<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/** Load cached data, or null if missing/expired (expired entries are removed). */
export function loadFromCache<T>(key: string): CachedData<T> | null {
  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!cached) return null;

    const parsed: CachedData<T> = JSON.parse(cached);
    if (isCacheExpired(parsed.timestamp, parsed.ttl)) {
      clearCache(key);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error(`[Cache] Failed to load (${key}):`, error);
    return null;
  }
}

/** Save data with a TTL (seconds). Falls back to clearing old caches on quota errors. */
export function saveToCache<T>(key: string, data: T, ttl: number = DEFAULT_TTL): void {
  const write = () =>
    localStorage.setItem(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({ data, timestamp: Date.now(), ttl } satisfies CachedData<T>)
    );
  try {
    write();
  } catch (error) {
    console.error(`[Cache] Failed to save (${key}):`, error);
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      clearOldCaches();
      try {
        write();
      } catch (retryError) {
        console.error("[Cache] Failed to save even after clearing:", retryError);
      }
    }
  }
}

/** True if `timestamp` (ms) is older than `ttl` (seconds). */
export function isCacheExpired(timestamp: number, ttl: number): boolean {
  return Date.now() - timestamp > ttl * 1000;
}

/** Clear all `spm_` caches, or only those whose key contains `pattern`. */
export function clearCache(pattern?: string): void {
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith(CACHE_PREFIX) && (!pattern || key.includes(pattern)))
      .forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.error("[Cache] Failed to clear cache:", error);
  }
}

/** Evict the oldest half of the `spm_` caches to free space. */
export function clearOldCaches(): void {
  try {
    const caches = Object.keys(localStorage)
      .filter(key => key.startsWith(CACHE_PREFIX))
      .map(key => {
        let timestamp = 0;
        try {
          timestamp = JSON.parse(localStorage.getItem(key) || "{}").timestamp || 0;
        } catch {
          timestamp = 0;
        }
        return { key, timestamp };
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    const toRemove = Math.ceil(caches.length / 2);
    for (let i = 0; i < toRemove; i++) localStorage.removeItem(caches[i].key);
  } catch (error) {
    console.error("[Cache] Failed to clear old caches:", error);
  }
}

export const CACHE_CONSTANTS = { CACHE_PREFIX, DEFAULT_TTL };
