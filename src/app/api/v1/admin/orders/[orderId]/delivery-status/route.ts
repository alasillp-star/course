import { z } from "zod";
import { overrideDeliveryStatus } from "@/modules/commerce/orders.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam, reasonSchema } from "@/server/http/schemas";
import { SHIPMENT_STATUSES } from "@/shared/enums";

const Body = z.object({ status: z.enum(SHIPMENT_STATUSES), reason: reasonSchema });

/** By-hand delivery status (bypasses the carrier; unlocks or re-locks cards). Audited. */
export const POST = withApi<{ orderId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "orders.delivery.override" });
  const body = await parseJsonBody(request, Body);
  return ok(
    await overrideDeliveryStatus(
      actor,
      { orderId: parseIdParam((await params).orderId), ...body },
      meta,
    ),
  );
});
