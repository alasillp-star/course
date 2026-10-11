import { z } from "zod";
import { cancelOrder } from "@/modules/commerce/orders.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam, reasonSchema } from "@/server/http/schemas";

const Body = z.object({ reason: reasonSchema });

export const POST = withApi<{ orderId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "orders.manage" });
  const { reason } = await parseJsonBody(request, Body);
  await cancelOrder(actor, { orderId: parseIdParam((await params).orderId), reason }, meta);
  return ok({ cancelled: true });
});
