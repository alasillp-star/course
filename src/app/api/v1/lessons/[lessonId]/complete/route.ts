import { requireApiActor } from "@/modules/identity/current";
import { completeLesson } from "@/modules/learning/lesson.service";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** Marks a lesson without video as completed. */
export const POST = withApi<{ lessonId: string }>(async (_request, { params }) => {
  const actor = await requireApiActor();
  return ok(await completeLesson(actor, parseIdParam((await params).lessonId)));
});
