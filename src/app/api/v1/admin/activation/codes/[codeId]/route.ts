import { getCardDetails } from "@/modules/activation/admin-codes.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

export const GET = withApi<{ codeId: string }>(async (_request, { params }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "activation.codes.read" });
  return ok(await getCardDetails(actor, parseIdParam((await params).codeId)));
});
