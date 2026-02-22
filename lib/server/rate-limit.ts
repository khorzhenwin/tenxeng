type RateLimitRecord = {
  lastSeenAt: number;
};

const GLOBAL_KEY = "__tenxengRateLimitStore__";

type Store = Map<string, RateLimitRecord>;

function shouldBypassRateLimitInTests(): boolean {
  return (
    process.env.NODE_ENV === "test" &&
    process.env.ENABLE_RATE_LIMIT_IN_TESTS !== "true"
  );
}

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
  if (shouldBypassRateLimitInTests()) {
    return { allowed: true, retryAfterMs: 0 };
  }
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

type SlidingWindowOptions = {
  windowMs?: number;
  maxRequests?: number;
};

const SLIDING_WINDOW_COLLECTION = "__rateLimits";

function slidingWindowDocId(key: string): string {
  return Buffer.from(key).toString("base64url");
}

export async function consumeSlidingWindowRateLimit(
  key: string,
  options?: SlidingWindowOptions
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  if (shouldBypassRateLimitInTests()) {
    return { allowed: true, retryAfterMs: 0 };
  }
  const { adminDb } = await import("@/lib/firebase/admin");
  const windowMs = options?.windowMs ?? 10_000;
  const maxRequests = options?.maxRequests ?? 15;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const ref = adminDb
    .collection(SLIDING_WINDOW_COLLECTION)
    .doc(slidingWindowDocId(key));

  let result: { allowed: boolean; retryAfterMs: number } = {
    allowed: true,
    retryAfterMs: 0
  };

  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const timestampsRaw = snap.get("timestamps");
    const timestamps = Array.isArray(timestampsRaw)
      ? timestampsRaw.filter(
          (value): value is number =>
            typeof value === "number" &&
            Number.isFinite(value) &&
            now - value < windowMs
        )
      : [];
    timestamps.sort((a, b) => a - b);

    if (timestamps.length >= maxRequests) {
      const oldestWithinWindow = timestamps[0] ?? now;
      result = {
        allowed: false,
        retryAfterMs: Math.max(0, windowMs - (now - oldestWithinWindow))
      };
      transaction.set(
        ref,
        {
          key,
          timestamps,
          windowMs,
          maxRequests,
          updatedAt: nowIso,
          expiresAt: new Date(now + windowMs).toISOString()
        },
        { merge: true }
      );
      return;
    }

    const nextTimestamps = [...timestamps, now];
    result = { allowed: true, retryAfterMs: 0 };
    transaction.set(
      ref,
      {
        key,
        timestamps: nextTimestamps,
        windowMs,
        maxRequests,
        updatedAt: nowIso,
        expiresAt: new Date(now + windowMs).toISOString()
      },
      { merge: true }
    );
  });

  return result;
}
