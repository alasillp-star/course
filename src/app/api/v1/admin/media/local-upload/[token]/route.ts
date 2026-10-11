import { writeLocalUpload } from "@/modules/content/media.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";

/**
 * Development storage upload target (what a presigned S3 URL is in
 * production). Streams the body to disk with the exact authorised size.
 */
export const PUT = withApi<{ token: string }>(async (request, { params }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "media.manage" });
  const stored = await writeLocalUpload(
    actor,
    (await params).token,
    request.headers.get("content-type"),
    request.body,
  );
  return ok(stored);
});
