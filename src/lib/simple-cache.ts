type CacheEntry<T> = { data: T; expires: number };

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function isNavigationReload(): boolean {
  if (typeof window === "undefined" || typeof performance === "undefined") return false;
  const [navigation] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return navigation?.type === "reload";
}

export function getCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (entry.expires < Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function setCache<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  if (typeof window === "undefined") return;
  try {
    const entry: CacheEntry<T> = { data, expires: Date.now() + ttlMs };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // sessionStorage full / unavailable / serialization failure — fail silent
  }
}

export function invalidateCache(keyOrPrefix: string, isPrefix = false): void {
  if (typeof window === "undefined") return;
  try {
    if (isPrefix) {
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(keyOrPrefix)) keys.push(k);
      }
      keys.forEach((k) => sessionStorage.removeItem(k));
    } else {
      sessionStorage.removeItem(keyOrPrefix);
    }
  } catch {
    // ignore
  }
}
