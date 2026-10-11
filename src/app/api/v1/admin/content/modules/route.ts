import { createModuleBody } from "@/modules/content/content.schemas";
import { createModule } from "@/modules/content/content.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";

export const POST = withApi(async (request, { meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.manage" });
  const input = await parseJsonBody(request, createModuleBody);
  return ok(await createModule(actor, input, meta), { status: 201 });
});
