import "../_env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Drops and rebuilds the database schema. Development/test only. */
const APP_ENV = process.env.APP_ENV ?? "development";
if (APP_ENV === "production" || APP_ENV === "staging") {
  console.error(`✗ db:reset refuses to run with APP_ENV=${APP_ENV}`);
  process.exit(1);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe(
      "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;",
    );
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    console.log("✓ database reset and migrated");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error("✗ reset failed:", error);
  process.exit(1);
});
