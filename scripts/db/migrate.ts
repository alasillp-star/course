import "../_env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies pending SQL migrations from ./drizzle inside a transaction.
 * Safe to run on every deploy (already-applied migrations are skipped).
 */
async function main() {
  // A direct / session connection is preferable for migrations; transaction
  // poolers (Supabase :6543, PgBouncer) need DATABASE_PREPARE=false.
  const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, {
    max: 1,
    onnotice: () => {},
    prepare: process.env.DATABASE_MIGRATION_URL ? true : process.env.DATABASE_PREPARE !== "false",
  });
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    console.log("✓ migrations applied");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error("✗ migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
