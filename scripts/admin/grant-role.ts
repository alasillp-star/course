import "../_env";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { assignRoleUnchecked } from "@/modules/access/rbac.service";
import { recordAudit } from "@/modules/audit/audit.service";
import { closeDb, getDb } from "@/server/db/client";
import { profiles, users } from "@/server/db/schema";
import { SYSTEM_REQUEST_META } from "@/server/http/request-meta";
import { SYSTEM_ROLES } from "@/shared/enums";

/**
 * Break-glass CLI for operators with database access:
 *   npm run admin:grant-role -- --email owner@example.com --role super_admin
 * The account is created (unverified) if needed; the action is audited.
 */
async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, role: { type: "string" } },
  });
  const email = values.email?.trim().toLowerCase();
  const role = values.role;
  if (!email || !role || !(SYSTEM_ROLES as readonly string[]).includes(role)) {
    throw new Error(`Usage: --email <address> --role <${SYSTEM_ROLES.join("|")}>`);
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    let [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (!user) {
      [user] = await tx.insert(users).values({ email }).returning({ id: users.id });
      await tx.insert(profiles).values({ userId: user!.id });
    }
    await assignRoleUnchecked(tx, { userId: user!.id, roleKey: role });
    await recordAudit(tx, {
      action: "rbac.role_granted",
      targetType: "user",
      targetId: user!.id,
      meta: SYSTEM_REQUEST_META,
      metadata: { role, via: "cli" },
    });
  });
  console.log(`✓ ${role} granted to ${email}`);
}

main()
  .catch((error: unknown) => {
    console.error("✗", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
