import "../_env";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";

/**
 * Data-retention housekeeping (schedule daily, e.g. Vercel Cron / GitHub
 * Actions / crontab):
 *  - OTP challenges older than 7 days,
 *  - sessions expired or revoked more than 30 days ago,
 *  - elapsed rate-limit windows,
 *  - e-mail delivery logs older than 90 days.
 * Audit logs and activation events are kept (append-only by design).
 */
async function main() {
  const db = getDb();
  const results = await db.transaction(async (tx) => ({
    otp: await tx.execute(sql`delete from auth_otp_challenges where created_at < now() - interval '7 days'`),
    sessions: await tx.execute(
      sql`delete from auth_sessions where (expires_at < now() - interval '30 days') or (revoked_at < now() - interval '30 days')`,
    ),
    rateLimits: await tx.execute(sql`delete from rate_limit_buckets where reset_at < now()`),
    emails: await tx.execute(sql`delete from email_deliveries where created_at < now() - interval '90 days'`),
  }));
  for (const [name, result] of Object.entries(results)) {
    console.log(`✓ ${name}: ${result.count} rows removed`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("✗ cleanup failed:", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
