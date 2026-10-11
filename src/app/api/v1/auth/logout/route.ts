import { recordAudit } from "@/modules/audit/audit.service";
import { clearSessionCookie, getCurrentActor } from "@/modules/identity/current";
import { revokeSession } from "@/modules/identity/session.service";
import { getDb } from "@/server/db/client";
import { ok, withApi } from "@/server/http/api";

/** Ends the current session server-side and clears the cookie. */
export const POST = withApi(async (_request, { meta }) => {
  const actor = await getCurrentActor();
  if (actor) {
    const db = getDb();
    await revokeSession(db, { userId: actor.userId, sessionId: actor.sessionId, reason: "logout" });
    await recordAudit(db, {
      action: "auth.logout",
      actorUserId: actor.userId,
      targetType: "session",
      targetId: actor.sessionId,
      meta,
    });
  }
  await clearSessionCookie();
  return ok({ signedOut: true });
});
