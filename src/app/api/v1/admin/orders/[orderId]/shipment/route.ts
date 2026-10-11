import { z } from "zod";
import { setOrderShipment } from "@/modules/commerce/orders.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

const Body = z.object({
  carrier: z.string().trim().min(2).max(60),
  trackingNumber: z.string().trim().min(3).max(80),
});

/** Records or corrects the carrier and tracking number of the order's parcel. */
export const PUT = withApi<{ orderId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "orders.manage" });
  const body = await parseJsonBody(request, Body);
  await setOrderShipment(actor, { orderId: parseIdParam((await params).orderId), ...body }, meta);
  return ok({ saved: true });
});
