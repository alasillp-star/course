import type { NextRequest } from "next/server";
import { recordAudit } from "@/modules/audit/audit.service";
import { clearSessionCookie, requireApiActor } from "@/modules/identity/current";
import { listActiveSessions, revokeAllSessions } from "@/modules/identity/session.service";
import { getDb } from "@/server/db/client";
import { ok, withApi } from "@/server/http/api";

/** The signed-in user's devices. */
export const GET = withApi(async () => {
  const actor = await requireApiActor();
  const sessions = await listActiveSessions(getDb(), actor.userId);
  return ok(
    sessions.map((session) => ({
      id: session.id,
      deviceLabel: session.deviceLabel,
      clientType: session.clientType,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      current: session.id === actor.sessionId,
    })),
  );
});

/**
 * Signs out other devices (default) or every device including this one
 * (`?scope=all`).
 */
export const DELETE = withApi(async (request: NextRequest, { meta }) => {
  const actor = await requireApiActor();
  const everywhere = request.nextUrl.searchParams.get("scope") === "all";
  const db = getDb();
  const revoked = await revokeAllSessions(db, {
    userId: actor.userId,
    reason: everywhere ? "logout_everywhere" : "logout_other_devices",
    exceptSessionId: everywhere ? undefined : actor.sessionId,
  });
  await recordAudit(db, {
    action: "auth.sessions_revoked_all",
    actorUserId: actor.userId,
    targetType: "user",
    targetId: actor.userId,
    meta,
    metadata: { count: revoked, includingCurrent: everywhere },
  });
  if (everywhere) await clearSessionCookie();
  return ok({ revoked });
});
