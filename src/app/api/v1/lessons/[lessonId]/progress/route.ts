import { heartbeatBody } from "@/modules/content/content.schemas";
import { requireApiActor } from "@/modules/identity/current";
import { recordHeartbeat } from "@/modules/learning/lesson.service";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** Player heartbeat: position + played ranges (coverage is validated server-side). */
export const POST = withApi<{ lessonId: string }>(async (request, { params }) => {
  const actor = await requireApiActor();
  const input = await parseJsonBody(request, heartbeatBody);
  return ok(await recordHeartbeat(actor, parseIdParam((await params).lessonId), input));
});
