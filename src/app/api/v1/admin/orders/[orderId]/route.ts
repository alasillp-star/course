import { getOrderDetail } from "@/modules/commerce/orders.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

export const GET = withApi<{ orderId: string }>(async (_request, { params }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "orders.read" });
  return ok(await getOrderDetail(actor, parseIdParam((await params).orderId)));
});
