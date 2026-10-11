import { updateModuleBody } from "@/modules/content/content.schemas";
import { deleteModule, updateModule } from "@/modules/content/content.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

export const PATCH = withApi<{ moduleId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.manage" });
  const input = await parseJsonBody(request, updateModuleBody);
  return ok(await updateModule(actor, parseIdParam((await params).moduleId), input, meta));
});

export const DELETE = withApi<{ moduleId: string }>(async (_request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.manage" });
  await deleteModule(actor, parseIdParam((await params).moduleId), meta);
  return ok({ deleted: true });
});
