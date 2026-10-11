import { eq, sql } from "drizzle-orm";
import type { Actor } from "@/modules/access/actor";
import {
  assignRoleUnchecked,
  isStaffRoleSet,
  loadUserAccess,
  syncAccessCatalog,
} from "@/modules/access/rbac.service";
import { createSession } from "@/modules/identity/session.service";
import { getDb } from "@/server/db/client";
import { courses, profiles, users } from "@/server/db/schema";
import {
  setEmailTransport,
  type EmailTransport,
  type OutgoingEmail,
} from "@/server/email/transports";
import type { RequestMeta } from "@/server/http/request-meta";
import type { SystemRole } from "@/shared/enums";

/** Captures outgoing e-mails so tests can read OTP codes. */
export class MemoryTransport implements EmailTransport {
  readonly name = "memory";
  messages: OutgoingEmail[] = [];

  async send(message: OutgoingEmail) {
    this.messages.push(message);
    return { messageId: String(this.messages.length) };
  }

  lastTo(email: string): OutgoingEmail | undefined {
    return [...this.messages].reverse().find((message) => message.to === email);
  }

  /** Extracts the 6-digit code from the most recent OTP e-mail sent to `email`. */
  otpFor(email: string): string {
    const message = this.lastTo(email);
    const match = message?.text.match(/\b(\d{6})\b/);
    if (!match?.[1]) throw new Error(`No OTP e-mail found for ${email}`);
    return match[1];
  }
}

export function installMemoryTransport(): MemoryTransport {
  const transport = new MemoryTransport();
  setEmailTransport(transport);
  return transport;
}

let ipCounter = 1;
/** Fresh request metadata with a distinct TEST-NET IP (keeps IP rate limits independent). */
export function testMeta(): RequestMeta {
  ipCounter = (ipCounter % 250) + 1;
  return {
    ip: `198.51.100.${ipCounter}`,
    userAgent: "Mozilla/5.0 (vitest) Chrome/140.0",
    requestId: `test-${ipCounter}`,
  };
}

export async function resetDatabase(): Promise<void> {
  const db = getDb();
  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const list = tables.map((table) => `"${table.tablename}"`).join(", ");
  await db.execute(sql.raw(`truncate table ${list} restart identity cascade`));
  await syncAccessCatalog(db);
}

export async function createCourse(slug = "main-course"): Promise<string> {
  const [course] = await getDb()
    .insert(courses)
    .values({ slug, title: { ar: "الدورة", fr: "La formation" }, status: "published" })
    .returning({ id: courses.id });
  return course!.id;
}

export async function createUser(
  email: string,
  roles: SystemRole[] = ["student"],
): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ email, emailVerifiedAt: new Date() })
    .returning({ id: users.id });
  await db.insert(profiles).values({ userId: user!.id });
  for (const role of roles) await assignRoleUnchecked(db, { userId: user!.id, roleKey: role });
  return user!.id;
}

/** Builds the Actor the request layer would produce (with a real session). */
export async function actorFor(
  userId: string,
  options: { mfaVerified?: boolean } = {},
): Promise<Actor> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("user not found");
  const access = await loadUserAccess(db, userId);
  const { session } = await createSession(db, {
    userId,
    meta: testMeta(),
    mfaVerified: options.mfaVerified ?? true,
  });
  const isStaff = isStaffRoleSet(access.roles);
  return {
    userId,
    email: user.email,
    status: user.status,
    locale: "ar",
    roles: access.roles,
    permissions: access.permissions,
    sessionId: session.id,
    isStaff,
    mfaVerified: isStaff && (options.mfaVerified ?? true),
    authenticatedAt: new Date(),
  };
}

export async function staffActor(email: string, role: SystemRole): Promise<Actor> {
  return actorFor(await createUser(email, [role]));
}

/** Asserts that a promise rejects with an AppError carrying `code`. */
export async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const actual = (error as { code?: string }).code;
    if (actual !== code) {
      throw new Error(`Expected AppError ${code}, got ${actual ?? String(error)}`);
    }
    return;
  }
  throw new Error(`Expected AppError ${code}, but the promise resolved`);
}
