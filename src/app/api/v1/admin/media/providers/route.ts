import { checkMediaProviders } from "@/modules/content/media.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";

/** "Test connection": authenticated calls to the configured video and file providers. */
export const GET = withApi(async () => {
  const actor = await requireApiActor({ adminArea: true, permission: "media.manage" });
  return ok(await checkMediaProviders(actor));
});
