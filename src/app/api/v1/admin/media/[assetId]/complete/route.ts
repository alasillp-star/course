import { completeUploadBody } from "@/modules/content/content.schemas";
import { completeUpload } from "@/modules/content/media.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** The browser finished uploading: verify the object and publish/attach it. */
export const POST = withApi<{ assetId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "media.manage" });
  const input = await parseJsonBody(request, completeUploadBody);
  return ok(await completeUpload(actor, parseIdParam((await params).assetId), input, meta));
});
