import type { Locale } from "@/i18n/config";
import { AppError } from "@/server/http/errors";
import type { UserStatus } from "@/shared/enums";
import type { Permission } from "./catalog";

/**
 * The authenticated principal for one request: who the user is, what they may
 * do, and how strongly the current session is authenticated.
 */
export type Actor = {
  userId: string;
  email: string;
  status: UserStatus;
  locale: Locale;
  roles: readonly string[];
  permissions: ReadonlySet<Permission>;
  sessionId: string;
  /** Holds any role other than `student` (admin area + mandatory MFA). */
  isStaff: boolean;
  /** Second factor completed recently enough for staff operations. */
  mfaVerified: boolean;
  /** When the user last proved control of their e-mail in this session. */
  authenticatedAt: Date;
};

export function can(actor: Pick<Actor, "permissions">, permission: Permission): boolean {
  return actor.permissions.has(permission);
}

export function canAny(actor: Pick<Actor, "permissions">, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => actor.permissions.has(permission));
}

/** Throws FORBIDDEN unless the actor holds `permission`. */
export function assertCan(actor: Pick<Actor, "permissions">, permission: Permission): void {
  if (!actor.permissions.has(permission)) {
    throw new AppError("FORBIDDEN", `Missing permission ${permission}`);
  }
}
