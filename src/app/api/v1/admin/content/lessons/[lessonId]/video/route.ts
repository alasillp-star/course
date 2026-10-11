import { detachLessonVideo } from "@/modules/content/media.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** Removes the video from a lesson (the asset stays in the media library). */
export const DELETE = withApi<{ lessonId: string }>(async (_request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "media.manage" });
  await detachLessonVideo(actor, parseIdParam((await params).lessonId), meta);
  return ok({ detached: true });
});
