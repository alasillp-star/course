import "server-only";
import { eq } from "drizzle-orm";
import type { Locale } from "@/i18n/config";
import type { Executor } from "@/server/db/client";
import { profiles, users } from "@/server/db/schema";
import type { RequestMeta } from "@/server/http/request-meta";
import { recordAudit } from "../audit/audit.service";
import { assignRoleUnchecked } from "../access/rbac.service";

export type UserRecord = typeof users.$inferSelect;

export async function findUserByEmail(executor: Executor, email: string): Promise<UserRecord | undefined> {
  const [user] = await executor.select().from(users).where(eq(users.email, email));
  return user;
}

export async function findUserById(executor: Executor, userId: string): Promise<UserRecord | undefined> {
  const [user] = await executor.select().from(users).where(eq(users.id, userId));
  return user;
}

/**
 * Returns the account for a verified e-mail, creating a student account when
 * none exists. Must only be called after the caller proved control of the
 * address (OTP). Safe under concurrency: the unique index on users.email
 * arbitrates simultaneous creations and the loser re-reads the winner's row.
 */
export async function findOrCreateVerifiedUser(
  executor: Executor,
  params: { email: string; locale: Locale; meta: RequestMeta },
): Promise<{ user: UserRecord; created: boolean }> {
  const existing = await findUserByEmail(executor, params.email);
  if (existing) {
    if (!existing.emailVerifiedAt) {
      const [verified] = await executor
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, existing.id))
        .returning();
      return { user: verified ?? existing, created: false };
    }
    return { user: existing, created: false };
  }

  const [inserted] = await executor
    .insert(users)
    .values({ email: params.email, emailVerifiedAt: new Date(), locale: params.locale })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (!inserted) {
    const winner = await findUserByEmail(executor, params.email);
    if (!winner) throw new Error("User vanished after concurrent creation");
    return { user: winner, created: false };
  }

  await executor.insert(profiles).values({ userId: inserted.id }).onConflictDoNothing();
  await assignRoleUnchecked(executor, { userId: inserted.id, roleKey: "student" });
  await recordAudit(executor, {
    action: "user.created",
    actorUserId: inserted.id,
    targetType: "user",
    targetId: inserted.id,
    meta: params.meta,
  });
  return { user: inserted, created: true };
}
