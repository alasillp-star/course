import { unassignCardFromOrder } from "@/modules/commerce/orders.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** Takes a still-locked card out of the order (wrong card packed, parcel returned). */
export const DELETE = withApi<{ orderId: string; codeId: string }>(
  async (_request, { params, meta }) => {
    const actor = await requireApiActor({ adminArea: true, permission: "orders.manage" });
    const { orderId, codeId } = await params;
    await unassignCardFromOrder(
      actor,
      { orderId: parseIdParam(orderId), codeId: parseIdParam(codeId) },
      meta,
    );
    return ok({ unassigned: true });
  },
);
