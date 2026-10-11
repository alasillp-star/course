import { z } from "zod";
import { assignCardToOrder } from "@/modules/commerce/orders.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

const Body = z.object({ serial: z.string().trim().min(3).max(40) });

/** Packs a printed card (by its serial) into the order's parcel. */
export const POST = withApi<{ orderId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "orders.manage" });
  const { serial } = await parseJsonBody(request, Body);
  const orderId = parseIdParam((await params).orderId);
  return ok(await assignCardToOrder(actor, { orderId, serial }, meta), { status: 201 });
});
