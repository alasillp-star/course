import { z } from "zod";
import { listBatchCodes } from "@/modules/activation/batches.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseSearchParams, withApi } from "@/server/http/api";
import { paginationSchema, parseIdParam } from "@/server/http/schemas";
import { ACTIVATION_CODE_STATUSES } from "@/shared/enums";

const Query = paginationSchema.extend({
  status: z.enum(ACTIVATION_CODE_STATUSES).optional(),
  locked: z.enum(["true", "false"]).optional(),
  search: z.string().trim().max(40).optional(),
});

export const GET = withApi<{ batchId: string }>(async (request, { params }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "activation.codes.read" });
  const query = parseSearchParams(request, Query);
  return ok(
    await listBatchCodes(actor, parseIdParam((await params).batchId), {
      ...query,
      locked: query.locked === "true",
    }),
  );
});
