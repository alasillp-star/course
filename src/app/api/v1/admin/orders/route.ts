import { z } from "zod";
import { createManualOrder, listOrders, ORDER_STAGES } from "@/modules/commerce/orders.service";
import { parseAmountMinor } from "@/modules/commerce/inbound";
import { requireApiActor } from "@/modules/identity/current";
import { AppError } from "@/server/http/errors";
import { ok, parseJsonBody, parseSearchParams, withApi } from "@/server/http/api";
import { paginationSchema } from "@/server/http/schemas";

const Query = paginationSchema.extend({
  stage: z.enum(ORDER_STAGES).default("all"),
  q: z.string().trim().max(120).optional(),
});

export const GET = withApi(async (request) => {
  const actor = await requireApiActor({ adminArea: true, permission: "orders.read" });
  const query = parseSearchParams(request, Query);
  return ok(
    await listOrders(actor, {
      stage: query.stage,
      search: query.q,
      limit: query.limit,
      offset: query.offset,
    }),
  );
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

const Body = z.object({
  fullName: z.string().trim().min(2).max(200),
  phone: optionalText(40),
  email: z
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  region: optionalText(120),
  city: optionalText(120),
  address: optionalText(500),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  /** Amount in DZD (major units), as typed by staff. */
  total: z.union([z.number(), z.string()]).optional(),
  product: optionalText(200),
  notes: optionalText(1000),
  carrier: optionalText(60),
  trackingNumber: optionalText(80),
});

/** Phone or walk-in order typed by staff. */
export const POST = withApi(async (request, { meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "orders.manage" });
  const { total, ...body } = await parseJsonBody(request, Body);
  const totalMinor = total === undefined || total === "" ? 0 : parseAmountMinor(total);
  if (totalMinor === undefined) {
    throw new AppError("VALIDATION_ERROR", undefined, { field: "total" });
  }
  return ok(await createManualOrder(actor, { ...body, totalMinor }, meta), { status: 201 });
});
