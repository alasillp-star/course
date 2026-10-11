import "server-only";
import { sql } from "drizzle-orm";
import { getDb, type Executor } from "./db/client";
import { keyedHash } from "./crypto";
import { AppError } from "./http/errors";

/**
 * Fixed-window rate limiting backed by PostgreSQL (one atomic upsert per hit).
 * This keeps the platform deployable with a single stateful dependency; the
 * `RateLimitStore` interface allows swapping in Redis (e.g. Upstash) when
 * traffic warrants it. Identifiers (e-mails, IPs) are stored only as keyed
 * hashes.
 */

export type RateLimitPolicy = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  // E-mail OTP issuance
  "otp:request:email": { limit: 5, windowSeconds: 60 * 60 },
  "otp:request:email:daily": { limit: 15, windowSeconds: 24 * 60 * 60 },
  "otp:request:ip": { limit: 30, windowSeconds: 60 * 60 },
  // OTP verification (per-challenge attempts are limited separately)
  "otp:verify:ip": { limit: 40, windowSeconds: 15 * 60 },
  "otp:verify:email:daily": { limit: 30, windowSeconds: 24 * 60 * 60 },
  // QR activation
  "activation:check:ip": { limit: 40, windowSeconds: 15 * 60 },
  "activation:start:ip": { limit: 15, windowSeconds: 15 * 60 },
  // Staff second factor
  "mfa:verify:user": { limit: 10, windowSeconds: 15 * 60 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: Date;
};

export interface RateLimitStore {
  hit(key: string, windowSeconds: number): Promise<{ count: number; resetAt: Date }>;
}

export class PostgresRateLimitStore implements RateLimitStore {
  constructor(private readonly executor?: Executor) {}

  async hit(key: string, windowSeconds: number) {
    const db = this.executor ?? getDb();
    const window = sql.raw(`interval '${Math.trunc(windowSeconds)} seconds'`);
    const rows = await db.execute<{ count: number; reset_at: Date | string }>(sql`
      insert into rate_limit_buckets as b (key, count, window_started_at, reset_at)
      values (${key}, 1, now(), now() + ${window})
      on conflict (key) do update set
        count = case when b.reset_at <= now() then 1 else b.count + 1 end,
        window_started_at = case when b.reset_at <= now() then now() else b.window_started_at end,
        reset_at = case when b.reset_at <= now() then now() + ${window} else b.reset_at end
      returning count, reset_at
    `);
    const row = rows[0];
    if (!row) throw new Error("rate limit upsert returned no row");
    return { count: Number(row.count), resetAt: new Date(row.reset_at) };
  }
}

let store: RateLimitStore = new PostgresRateLimitStore();

/** Allows tests (or a Redis adapter) to replace the backing store. */
export function setRateLimitStore(next: RateLimitStore): void {
  store = next;
}

export async function consumeRateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitResult> {
  const policy: RateLimitPolicy = RATE_LIMITS[name];
  const key = `${name}:${keyedHash("rate-limit-key", identifier.toLowerCase())}`;
  const { count, resetAt } = await store.hit(key, policy.windowSeconds);
  return {
    allowed: count <= policy.limit,
    count,
    remaining: Math.max(0, policy.limit - count),
    resetAt,
  };
}

/** Consumes one unit and throws RATE_LIMITED when the policy is exceeded. */
export async function enforceRateLimit(name: RateLimitName, identifier: string | null) {
  if (!identifier) return;
  const result = await consumeRateLimit(name, identifier);
  if (!result.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
    );
    throw new AppError("RATE_LIMITED", `Rate limit ${name} exceeded`, { retryAfterSeconds });
  }
}
