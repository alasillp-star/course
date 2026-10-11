import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { recordAudit } from "@/modules/audit/audit.service";
import { closeDb, getDb } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { createCourse, createUser, resetDatabase, testMeta } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeDb();
});

describe("database hardening", () => {
  it("enables row level security on every table in the public schema", async () => {
    const rows = await getDb().execute<{ tablename: string; rowsecurity: boolean }>(
      sql`select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
    );
    expect(rows.length).toBeGreaterThan(50);
    expect(rows.filter((row) => !row.rowsecurity).map((row) => row.tablename)).toEqual([]);
  });

  it("keeps the audit log append-only", async () => {
    await recordAudit(getDb(), { action: "auth.login", meta: testMeta(), metadata: { pin: "12345678" } });
    const [entry] = await getDb().select().from(auditLogs);
    expect(entry?.metadata).toEqual({ pin: "[redacted]" });
    await expect(getDb().execute(sql`update audit_logs set action = 'tampered'`)).rejects.toThrow();
    await expect(getDb().execute(sql`delete from audit_logs`)).rejects.toThrow();
  });

  it("rejects an activated card without an owner (CHECK constraint)", async () => {
    const courseId = await createCourse();
    const db = getDb();
    await db.execute(sql`
      insert into activation_batches (id, serial_prefix, name, course_id, quantity)
      values ('00000000-0000-7000-8000-000000000001', 'B9999', 'x', ${courseId}, 1)`);
    await expect(
      db.execute(sql`
        insert into activation_codes (batch_id, sequence, serial, code_hash, status)
        values ('00000000-0000-7000-8000-000000000001', 1, 'B9999-00001', 'h', 'activated')`),
    ).rejects.toThrow();
  });

  it("allows at most one active entitlement per student and course", async () => {
    const courseId = await createCourse();
    const userId = await createUser("one@example.com");
    const db = getDb();
    await db.execute(sql`insert into course_entitlements (user_id, course_id, source) values (${userId}, ${courseId}, 'manual_grant')`);
    await expect(
      db.execute(sql`insert into course_entitlements (user_id, course_id, source) values (${userId}, ${courseId}, 'manual_grant')`),
    ).rejects.toThrow();
  });

  it("stores e-mails normalised and unique", async () => {
    await createUser("unique@example.com");
    await expect(getDb().execute(sql`insert into users (email) values ('UNIQUE@example.com')`)).rejects.toThrow();
    await expect(getDb().execute(sql`insert into users (email) values ('unique@example.com')`)).rejects.toThrow();
  });
});
