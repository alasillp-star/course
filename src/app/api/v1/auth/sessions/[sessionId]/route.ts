import { recordAudit } from "@/modules/audit/audit.service";
import { clearSessionCookie, requireApiActor } from "@/modules/identity/current";
import { revokeSession } from "@/modules/identity/session.service";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** Signs out one of the user's own devices. */
export const DELETE = withApi<{ sessionId: string }>(async (_request, { params, meta }) => {
  const actor = await requireApiActor();
  const sessionId = parseIdParam((await params).sessionId);
  const db = getDb();
  const revoked = await revokeSession(db, {
    userId: actor.userId,
    sessionId,
    reason: "user_revoked",
  });
  if (!revoked) throw new AppError("NOT_FOUND");
  await recordAudit(db, {
    action: "auth.session_revoked",
    actorUserId: actor.userId,
    targetType: "session",
    targetId: sessionId,
    meta,
  });
  if (sessionId === actor.sessionId) await clearSessionCookie();
  return ok({ revoked: true });
});
