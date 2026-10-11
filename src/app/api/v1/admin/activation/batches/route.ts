import { z } from "zod";
import { createBatch, listBatches, MAX_BATCH_SIZE } from "@/modules/activation/batches.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, parseSearchParams, withApi } from "@/server/http/api";
import { paginationSchema, uuidSchema } from "@/server/http/schemas";

export const GET = withApi(async (request) => {
  const actor = await requireApiActor({ adminArea: true, permission: "activation.batches.read" });
  const { limit, offset } = parseSearchParams(request, paginationSchema);
  return ok(await listBatches(actor, { limit, offset }));
});

const CreateBody = z.object({
  name: z.string().trim().min(2).max(120),
  courseId: uuidSchema,
  quantity: z.number().int().min(1).max(MAX_BATCH_SIZE),
  requiresPin: z.boolean().default(true),
  requiresSale: z.boolean().default(true),
  redeemBy: z.iso.datetime({ offset: true }).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

export const POST = withApi(async (request, { meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "activation.batches.create" });
  const body = await parseJsonBody(request, CreateBody);
  const batch = await createBatch(
    actor,
    { ...body, redeemBy: body.redeemBy ? new Date(body.redeemBy) : null, notes: body.notes ?? null },
    meta,
  );
  return ok(batch, { status: 201 });
});
