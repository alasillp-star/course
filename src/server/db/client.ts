import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "../env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
/** A transaction handle; services accept `Executor` so they compose inside transactions. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;

type DbState = { db: Database; client: postgres.Sql };

const globalForDb = globalThis as unknown as { __academyDb?: DbState };

function createDb(): DbState {
  const env = getEnv();
  const client = postgres(env.DATABASE_URL, {
    max: env.DATABASE_POOL_MAX,
    prepare: env.DATABASE_PREPARE,
    idle_timeout: 20,
    connect_timeout: 10,
    // Never let the driver print query parameters (they can contain secrets).
    debug: false,
    onnotice: () => {},
    connection: { application_name: "academy-platform" },
  });
  const db = drizzle(client, { schema, casing: "snake_case" });
  return { db, client };
}

/** Lazily created, process-wide connection pool (reused across dev hot reloads). */
export function getDb(): Database {
  globalForDb.__academyDb ??= createDb();
  return globalForDb.__academyDb.db;
}

/** Closes the pool (scripts and tests). */
export async function closeDb(): Promise<void> {
  const state = globalForDb.__academyDb;
  globalForDb.__academyDb = undefined;
  await state?.client.end({ timeout: 5 });
}
