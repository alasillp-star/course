import { z } from "zod";
import { markCardsSold } from "@/modules/activation/admin-codes.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";

const Body = z.object({
  serials: z.array(z.string().trim().min(3).max(40)).min(1).max(2000),
});

/** Point-of-sale activation of one or many cards (delivery orders: see /admin/orders). */
export const POST = withApi(async (request, { meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "activation.codes.sell" });
  const body = await parseJsonBody(request, Body);
  return ok(await markCardsSold(actor, body, meta));
});
