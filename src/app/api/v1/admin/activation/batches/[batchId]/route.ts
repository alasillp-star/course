import { getBatchForActor } from "@/modules/activation/batches.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

export const GET = withApi<{ batchId: string }>(async (_request, { params }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "activation.batches.read" });
  return ok(await getBatchForActor(actor, parseIdParam((await params).batchId)));
});
