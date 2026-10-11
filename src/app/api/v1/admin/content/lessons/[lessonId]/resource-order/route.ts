import { resourceOrderBody } from "@/modules/content/content.schemas";
import { reorderResources } from "@/modules/content/content.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

export const PUT = withApi<{ lessonId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.manage" });
  const { resourceIds } = await parseJsonBody(request, resourceOrderBody);
  await reorderResources(actor, parseIdParam((await params).lessonId), resourceIds, meta);
  return ok({ reordered: true });
});
