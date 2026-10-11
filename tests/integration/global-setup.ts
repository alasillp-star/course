import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Rebuilds the integration database from the migrations once per run, so the
 * tests always exercise the real schema (constraints, indexes, triggers, RLS).
 */
export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgres://academy:academy_dev_password@127.0.0.1:5432/academy_test";
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(`Refusing to reset a database whose name does not contain "test": ${url}`);
  }
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe(
      "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;",
    );
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  } finally {
    await client.end({ timeout: 5 });
  }
}
