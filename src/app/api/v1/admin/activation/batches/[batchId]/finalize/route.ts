import { purgeBatchSecrets } from "@/modules/activation/batches.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** Irreversibly deletes printable secrets after the print run is confirmed. */
export const POST = withApi<{ batchId: string }>(async (_request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "activation.batches.finalize" });
  await purgeBatchSecrets(actor, parseIdParam((await params).batchId), meta);
  return ok({ finalized: true });
});
