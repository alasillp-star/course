import { moduleOrderBody } from "@/modules/content/content.schemas";
import { reorderModules } from "@/modules/content/content.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

export const PUT = withApi<{ courseId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.manage" });
  const { moduleIds } = await parseJsonBody(request, moduleOrderBody);
  await reorderModules(actor, parseIdParam((await params).courseId), moduleIds, meta);
  return ok({ reordered: true });
});
