import { updateResourceBody } from "@/modules/content/content.schemas";
import { updateResource } from "@/modules/content/content.service";
import { removeResource } from "@/modules/content/media.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

export const PATCH = withApi<{ resourceId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.manage" });
  const input = await parseJsonBody(request, updateResourceBody);
  return ok(await updateResource(actor, parseIdParam((await params).resourceId), input, meta));
});

export const DELETE = withApi<{ resourceId: string }>(async (_request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.manage" });
  await removeResource(actor, parseIdParam((await params).resourceId), meta);
  return ok({ deleted: true });
});
