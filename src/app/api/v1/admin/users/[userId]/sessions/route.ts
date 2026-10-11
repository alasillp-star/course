import { revokeUserSessions } from "@/modules/identity/admin-users.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** Signs a user out of every device (e.g. after a reported account compromise). */
export const DELETE = withApi<{ userId: string }>(async (_request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "users.sessions.manage" });
  const revoked = await revokeUserSessions(actor, parseIdParam((await params).userId), meta);
  return ok({ revoked });
});
