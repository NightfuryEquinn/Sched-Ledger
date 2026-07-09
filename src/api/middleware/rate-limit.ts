import { getClientIp } from "@/api/lib/auth";
import { tooManyRequests } from "@/api/lib/errors";
import { createMiddleware } from "hono/factory";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function checkLimit(key: string, limit: number, windowMs: number): number | null {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (bucket.count >= limit) {
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  }
  bucket.count += 1;
  return null;
}

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  keyPrefix: string;
  keyFn?: (c: Parameters<Parameters<typeof createMiddleware>[0]>[0]) => string;
};

export function rateLimit(opts: RateLimitOptions) {
  return createMiddleware(async (c, next) => {
    const suffix = opts.keyFn ? opts.keyFn(c) : getClientIp(c);
    const key = `${opts.keyPrefix}:${suffix}`;
    const retryAfter = checkLimit(key, opts.limit, opts.windowMs);
    if (retryAfter !== null) tooManyRequests("Too many requests. Please try again later.");
    await next();
  });
}

export const globalRateLimit = rateLimit({
  keyPrefix: "global",
  limit: 180,
  windowMs: 60_000,
});

export const authChallengeRateLimit = rateLimit({
  keyPrefix: "auth-challenge",
  limit: 12,
  windowMs: 60_000,
});

export const authVerifyRateLimit = rateLimit({
  keyPrefix: "auth-verify",
  limit: 8,
  windowMs: 60_000,
});
