type RateLimitRecord = {
  lastSeenAt: number;
};

const GLOBAL_KEY = "__tenxengRateLimitStore__";

type Store = Map<string, RateLimitRecord>;

function getStore(): Store {
  const globalObj = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: Store;
  };
  if (!globalObj[GLOBAL_KEY]) {
    globalObj[GLOBAL_KEY] = new Map<string, RateLimitRecord>();
  }
  return globalObj[GLOBAL_KEY] as Store;
}

export function consumeRateLimit(
  key: string,
  options?: { windowMs?: number }
): { allowed: boolean; retryAfterMs: number } {
  const windowMs = options?.windowMs ?? 1000;
  const now = Date.now();
  const store = getStore();
  const current = store.get(key);
  if (!current) {
    store.set(key, { lastSeenAt: now });
    return { allowed: true, retryAfterMs: 0 };
  }

  const elapsed = now - current.lastSeenAt;
  if (elapsed < windowMs) {
    return { allowed: false, retryAfterMs: windowMs - elapsed };
  }

  store.set(key, { lastSeenAt: now });
  return { allowed: true, retryAfterMs: 0 };
}
