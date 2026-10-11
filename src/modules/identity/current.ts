import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/http/errors";
import { assertCan, type Actor } from "../access/actor";
import type { Permission } from "../access/catalog";
import { isStaffRoleSet, loadUserAccess } from "../access/rbac.service";
import { isMfaFresh, validateSessionToken } from "./session.service";

/**
 * Next.js boundary of the identity module: session cookie handling and the
 * Data Access Layer entry points used by pages, layouts and route handlers.
 * Proxy-level checks are only optimistic redirects; these functions are the
 * real gate and run on every protected request.
 */

export function sessionCookieName(): string {
  // The __Host- prefix pins the cookie to this exact origin over HTTPS.
  return getEnv().APP_URL.startsWith("https://") ? "__Host-academy_session" : "academy_session";
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    secure: getEnv().APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete({ name: sessionCookieName(), path: "/" });
}

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(sessionCookieName())?.value ?? null;
}

/** Resolves the authenticated actor for this request (memoised per request). */
export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  const db = getDb();
  const resolved = await validateSessionToken(db, token);
  if (!resolved) return null;
  const { session, user } = resolved;
  const access = await loadUserAccess(db, user.id);
  const isStaff = isStaffRoleSet(access.roles);
  const mfaRequired = getEnv().STAFF_MFA_REQUIRED;
  return {
    userId: user.id,
    email: user.email,
    status: user.status,
    locale: isLocale(user.locale) ? user.locale : "ar",
    roles: access.roles,
    permissions: access.permissions,
    sessionId: session.id,
    isStaff,
    mfaVerified: isStaff && (!mfaRequired || isMfaFresh(session)),
    authenticatedAt: session.authenticatedAt,
  };
});

type RequireOptions = {
  permission?: Permission;
  /** Staff endpoints/pages: require a fresh second factor. */
  adminArea?: boolean;
};

/** For Route Handlers: throws 401/403 AppErrors (rendered as JSON). */
export async function requireApiActor(options: RequireOptions = {}): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) throw new AppError("UNAUTHENTICATED");
  if (options.adminArea) {
    if (!actor.isStaff) throw new AppError("FORBIDDEN");
    if (!actor.mfaVerified) throw new AppError("MFA_REQUIRED");
  }
  if (options.permission) assertCan(actor, options.permission);
  return actor;
}

/** For pages/layouts: redirects to sign-in / MFA, or to the forbidden page. */
export async function requirePageActor(
  locale: Locale,
  options: RequireOptions & { next?: string } = {},
): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) {
    const next = options.next ? `?next=${encodeURIComponent(options.next)}` : "";
    redirect(`/${locale}/login${next}`);
  }
  if (options.adminArea) {
    if (!actor.isStaff) redirect(`/${locale}/forbidden`);
    if (!actor.mfaVerified) redirect(`/${locale}/admin/mfa`);
  }
  if (options.permission && !actor.permissions.has(options.permission)) {
    redirect(`/${locale}/forbidden`);
  }
  return actor;
}

export const RECENT_AUTH_MINUTES = 30;

export function isRecentlyAuthenticated(
  actor: Pick<Actor, "authenticatedAt">,
  maxAgeMinutes = RECENT_AUTH_MINUTES,
): boolean {
  return Date.now() - actor.authenticatedAt.getTime() <= maxAgeMinutes * 60_000;
}

/** Sensitive self-service changes require a recent e-mail proof in this session. */
export function assertRecentAuthentication(
  actor: Actor,
  maxAgeMinutes = RECENT_AUTH_MINUTES,
): void {
  if (!isRecentlyAuthenticated(actor, maxAgeMinutes)) {
    throw new AppError("REAUTHENTICATION_REQUIRED");
  }
}
