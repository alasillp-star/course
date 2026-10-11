import { requireApiActor } from "@/modules/identity/current";
import { listUserEntitlements } from "@/modules/entitlements/entitlements.service";
import { getDb } from "@/server/db/client";
import { ok, withApi } from "@/server/http/api";

/** Current account, roles and course access (no secrets, no internal ids beyond the user's own). */
export const GET = withApi(async () => {
  const actor = await requireApiActor();
  const entitlements = await listUserEntitlements(getDb(), actor.userId);
  return ok({
    id: actor.userId,
    email: actor.email,
    locale: actor.locale,
    roles: actor.roles,
    isStaff: actor.isStaff,
    mfaVerified: actor.mfaVerified,
    entitlements: entitlements.map((entitlement) => ({
      courseSlug: entitlement.courseSlug,
      courseTitle: entitlement.courseTitle,
      status: entitlement.status,
      source: entitlement.source,
      startsAt: entitlement.startsAt,
      expiresAt: entitlement.expiresAt,
    })),
  });
});
