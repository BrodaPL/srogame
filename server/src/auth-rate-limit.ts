type RateLimitBucketState = {
  count: number;
  windowStartedAt: number;
};

type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

type RateLimitResult =
  | { allowed: true; retryAfterSeconds: 0 }
  | { allowed: false; retryAfterSeconds: number };

const bucketStates = new Map<string, RateLimitBucketState>();

export function consumeRateLimit(
  bucketName: string,
  identity: string,
  config: RateLimitConfig,
  now = Date.now()
): RateLimitResult {
  const normalizedIdentity = identity.trim() || 'anonymous';
  const key = `${bucketName}:${normalizedIdentity}`;
  const current = bucketStates.get(key);

  if (!current || now - current.windowStartedAt >= config.windowMs) {
    bucketStates.set(key, { count: 1, windowStartedAt: now });
    pruneExpiredRateLimitEntries(now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= config.limit) {
    const retryAfterMs = Math.max(0, config.windowMs - (now - current.windowStartedAt));
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function pruneExpiredRateLimitEntries(now: number): void {
  for (const [key, state] of bucketStates.entries()) {
    if (now - state.windowStartedAt >= 24 * 60 * 60 * 1000) {
      bucketStates.delete(key);
    }
  }
}
