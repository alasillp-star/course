import "server-only";
import { sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";

/**
 * Data-retention housekeeping, run daily (Vercel Cron → /api/cron/maintenance,
 * or `npm run maintenance:cleanup` from any scheduler):
 *  - OTP challenges older than 7 days,
 *  - sessions expired or revoked more than 30 days ago,
 *  - elapsed rate-limit windows,
 *  - e-mail delivery logs older than 90 days,
 *  - raw integration messages (landing-page orders, carrier updates: customer
 *    names, phones, addresses) older than 30 days — orders and shipments stay.
 * Audit logs and activation events are kept (append-only by design).
 */
export async function runMaintenance(db: Database): Promise<Record<string, number>> {
  const results = await db.transaction(async (tx) => ({
    otp: await tx.execute(
      sql`delete from auth_otp_challenges where created_at < now() - interval '7 days'`,
    ),
    sessions: await tx.execute(
      sql`delete from auth_sessions where (expires_at < now() - interval '30 days') or (revoked_at < now() - interval '30 days')`,
    ),
    rateLimits: await tx.execute(sql`delete from rate_limit_buckets where reset_at < now()`),
    emails: await tx.execute(
      sql`delete from email_deliveries where created_at < now() - interval '90 days'`,
    ),
    integrationEvents: await tx.execute(
      sql`delete from integration_events where received_at < now() - interval '30 days'`,
    ),
  }));
  return Object.fromEntries(Object.entries(results).map(([name, result]) => [name, result.count]));
}
