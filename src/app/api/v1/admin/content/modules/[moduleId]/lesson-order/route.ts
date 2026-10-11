import { lessonOrderBody } from "@/modules/content/content.schemas";
import { reorderLessons } from "@/modules/content/content.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** Full lesson order of a module; lessons from other modules of the course move here. */
export const PUT = withApi<{ moduleId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.manage" });
  const { lessonIds } = await parseJsonBody(request, lessonOrderBody);
  await reorderLessons(actor, parseIdParam((await params).moduleId), lessonIds, meta);
  return ok({ reordered: true });
});
