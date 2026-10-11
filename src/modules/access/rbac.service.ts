import "server-only";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { permissions, rolePermissions, roles, userRoles, users } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import { SYSTEM_ROLES, type SystemRole } from "@/shared/enums";
import { recordAudit } from "../audit/audit.service";
import { assertCan, can, type Actor } from "./actor";
import { isPermission, PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, type Permission } from "./catalog";

export type UserAccess = { roles: string[]; permissions: Set<Permission> };

/** Loads a user's roles and the union of their permissions (one query). */
export async function loadUserAccess(executor: Executor, userId: string): Promise<UserAccess> {
  const rows = await executor
    .select({ roleKey: roles.key, permissionKey: rolePermissions.permissionKey })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const roleSet = new Set<string>();
  const permissionSet = new Set<Permission>();
  for (const row of rows) {
    roleSet.add(row.roleKey);
    if (row.permissionKey && isPermission(row.permissionKey)) permissionSet.add(row.permissionKey);
  }
  return { roles: [...roleSet].sort(), permissions: permissionSet };
}

export function isStaffRoleSet(roleKeys: readonly string[]): boolean {
  return roleKeys.some((role) => role !== "student");
}

async function findRoleId(executor: Executor, roleKey: string): Promise<string> {
  const [role] = await executor.select({ id: roles.id }).from(roles).where(eq(roles.key, roleKey));
  if (!role) throw new AppError("NOT_FOUND", `Unknown role ${roleKey}`);
  return role.id;
}

/** Assigns a role during account creation or seeding (no actor checks). */
export async function assignRoleUnchecked(
  executor: Executor,
  params: { userId: string; roleKey: SystemRole | string; grantedBy?: string | null },
): Promise<void> {
  const roleId = await findRoleId(executor, params.roleKey);
  await executor
    .insert(userRoles)
    .values({ userId: params.userId, roleId, grantedBy: params.grantedBy ?? null })
    .onConflictDoNothing();
}

const PRIVILEGED_ROLES = new Set<string>(["super_admin", "admin"]);

/**
 * Staff role assignment with escalation guards:
 *  - requires `staff.manage`; granting/revoking admin or super_admin also
 *    requires `roles.manage` (Super Admin only);
 *  - nobody can change their own roles;
 *  - the last Super Admin cannot be removed.
 */
export async function grantRole(
  executor: Executor,
  actor: Actor,
  params: { userId: string; roleKey: string },
  meta: RequestMeta,
): Promise<void> {
  assertCan(actor, "staff.manage");
  if (PRIVILEGED_ROLES.has(params.roleKey)) assertCan(actor, "roles.manage");
  if (params.userId === actor.userId) throw new AppError("FORBIDDEN", "Cannot change own roles");

  const [target] = await executor
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.id, params.userId));
  if (!target || target.status === "deleted") throw new AppError("NOT_FOUND", "User not found");

  const roleId = await findRoleId(executor, params.roleKey);
  const inserted = await executor
    .insert(userRoles)
    .values({ userId: params.userId, roleId, grantedBy: actor.userId })
    .onConflictDoNothing()
    .returning({ userId: userRoles.userId });
  if (inserted.length > 0) {
    await recordAudit(executor, {
      action: "rbac.role_granted",
      actorUserId: actor.userId,
      targetType: "user",
      targetId: params.userId,
      meta,
      metadata: { role: params.roleKey },
    });
  }
}

export async function revokeRole(
  executor: Executor,
  actor: Actor,
  params: { userId: string; roleKey: string },
  meta: RequestMeta,
): Promise<void> {
  assertCan(actor, "staff.manage");
  if (PRIVILEGED_ROLES.has(params.roleKey)) assertCan(actor, "roles.manage");
  if (params.userId === actor.userId) throw new AppError("FORBIDDEN", "Cannot change own roles");

  const roleId = await findRoleId(executor, params.roleKey);
  if (params.roleKey === "super_admin") {
    const [{ count } = { count: 0 }] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(userRoles)
      .where(eq(userRoles.roleId, roleId));
    if (count <= 1) throw new AppError("INVALID_STATE", "Cannot remove the last Super Admin");
  }
  const removed = await executor
    .delete(userRoles)
    .where(and(eq(userRoles.userId, params.userId), eq(userRoles.roleId, roleId)))
    .returning({ userId: userRoles.userId });
  if (removed.length > 0) {
    await recordAudit(executor, {
      action: "rbac.role_revoked",
      actorUserId: actor.userId,
      targetType: "user",
      targetId: params.userId,
      meta,
      metadata: { role: params.roleKey },
    });
  }
}

/**
 * Idempotently synchronises the permission catalogue and the built-in roles'
 * permission sets to the database (run by `npm run db:seed` on every deploy).
 */
export async function syncAccessCatalog(executor: Executor): Promise<void> {
  const permissionRows = Object.entries(PERMISSIONS).map(([key, description]) => ({
    key,
    description,
    module: key.split(".")[0] ?? key,
  }));
  await executor
    .insert(permissions)
    .values(permissionRows)
    .onConflictDoUpdate({
      target: permissions.key,
      set: { description: sql`excluded.description`, module: sql`excluded.module` },
    });
  await executor.delete(permissions).where(
    notInArray(
      permissions.key,
      permissionRows.map((row) => row.key),
    ),
  );

  for (const roleKey of SYSTEM_ROLES) {
    const label = ROLE_LABELS[roleKey];
    const [role] = await executor
      .insert(roles)
      .values({ key: roleKey, name: label.name, description: label.description, isSystem: true })
      .onConflictDoUpdate({
        target: roles.key,
        set: { name: label.name, description: label.description, isSystem: true },
      })
      .returning({ id: roles.id });
    if (!role) throw new Error(`Failed to upsert role ${roleKey}`);

    const granted = ROLE_PERMISSIONS[roleKey];
    if (granted.length > 0) {
      await executor
        .insert(rolePermissions)
        .values(granted.map((permissionKey) => ({ roleId: role.id, permissionKey })))
        .onConflictDoNothing();
    }
    const stale = executor
      .delete(rolePermissions)
      .where(
        granted.length > 0
          ? and(
              eq(rolePermissions.roleId, role.id),
              notInArray(rolePermissions.permissionKey, [...granted]),
            )
          : eq(rolePermissions.roleId, role.id),
      );
    await stale;
  }
}

/** Staff directory with their roles (for the staff-permissions screen). */
export async function listStaff(executor: Executor, actor: Actor) {
  assertCan(actor, "staff.read");
  const rows = await executor
    .select({ userId: users.id, email: users.email, status: users.status, roleKey: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(inArray(roles.key, SYSTEM_ROLES.filter((role) => role !== "student")));
  const byUser = new Map<string, { userId: string; email: string; status: string; roles: string[] }>();
  for (const row of rows) {
    const entry = byUser.get(row.userId) ?? {
      userId: row.userId,
      email: row.email,
      status: row.status,
      roles: [],
    };
    entry.roles.push(row.roleKey);
    byUser.set(row.userId, entry);
  }
  return [...byUser.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export { can };
