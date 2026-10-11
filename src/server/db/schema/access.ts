import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, pk, tstz, updatedAt } from "./_columns";
import { users } from "./identity";

/**
 * Role-based access control. The permission catalogue and the permission sets
 * of the seven system roles are defined in code (src/modules/access/catalog.ts)
 * and synchronised to these tables by `npm run db:seed`; custom roles can be
 * added later from the admin UI without code changes.
 */
export const roles = pgTable(
  "roles",
  {
    id: pk(),
    key: text().notNull(),
    name: text().notNull(),
    description: text(),
    isSystem: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("roles_key_key").on(t.key)],
);

export const permissions = pgTable("permissions", {
  key: text().primaryKey(),
  module: text().notNull(),
  description: text().notNull(),
  createdAt: createdAt(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: text()
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionKey] }),
    index("role_permissions_permission_idx").on(t.permissionKey),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    grantedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    grantedAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.roleId] }),
    index("user_roles_role_idx").on(t.roleId),
  ],
);
