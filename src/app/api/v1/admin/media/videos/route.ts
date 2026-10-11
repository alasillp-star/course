import { startVideoUploadBody } from "@/modules/content/content.schemas";
import { startVideoUpload } from "@/modules/content/media.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";

/** Creates a direct upload at the video provider for a lesson. */
export const POST = withApi(async (request, { meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "media.manage" });
  const input = await parseJsonBody(request, startVideoUploadBody);
  return ok(await startVideoUpload(actor, input, meta), { status: 201 });
});
