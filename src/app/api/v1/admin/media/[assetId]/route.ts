import { getMediaStatus } from "@/modules/content/media.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** Processing status (reconciles with the provider when a webhook is late). */
export const GET = withApi<{ assetId: string }>(async (_request, { params }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "media.manage" });
  return ok(await getMediaStatus(actor, parseIdParam((await params).assetId)));
});
