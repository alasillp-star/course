import { z } from "zod";
import { replaceCard } from "@/modules/activation/admin-codes.service";
import { formatCardCode, formatCardPin } from "@/modules/activation/codes";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam, reasonSchema } from "@/server/http/schemas";

const Body = z.object({ reason: reasonSchema });

/** Revokes the card and returns the replacement's secrets exactly once. */
export const POST = withApi<{ codeId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "activation.codes.revoke" });
  const { reason } = await parseJsonBody(request, Body);
  const card = await replaceCard(
    actor,
    { codeId: parseIdParam((await params).codeId), reason },
    meta,
  );
  return ok({
    codeId: card.codeId,
    serial: card.serial,
    code: formatCardCode(card.code),
    pin: card.pin ? formatCardPin(card.pin) : null,
    url: card.url,
  });
});
