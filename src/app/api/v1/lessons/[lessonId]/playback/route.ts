import { requireApiActor } from "@/modules/identity/current";
import { issuePlayback } from "@/modules/learning/lesson.service";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** Short-lived, viewer-bound playback source (after the course access check). */
export const GET = withApi<{ lessonId: string }>(async (_request, { params }) => {
  const actor = await requireApiActor();
  return ok(await issuePlayback(actor, parseIdParam((await params).lessonId)));
});
