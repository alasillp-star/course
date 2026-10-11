import { markCardUnsold } from "@/modules/activation/admin-codes.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

export const POST = withApi<{ codeId: string }>(async (_request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "activation.codes.sell" });
  await markCardUnsold(actor, parseIdParam((await params).codeId), meta);
  return ok({ unsold: true });
});
