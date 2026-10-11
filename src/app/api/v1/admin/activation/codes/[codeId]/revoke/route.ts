import { z } from "zod";
import { revokeCard } from "@/modules/activation/admin-codes.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam, reasonSchema } from "@/server/http/schemas";

const Body = z.object({ reason: reasonSchema });

export const POST = withApi<{ codeId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "activation.codes.revoke" });
  const { reason } = await parseJsonBody(request, Body);
  await revokeCard(actor, { codeId: parseIdParam((await params).codeId), reason }, meta);
  return ok({ revoked: true });
});
