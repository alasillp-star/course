import { addResourceBody } from "@/modules/content/content.schemas";
import { addLinkResource } from "@/modules/content/content.service";
import { startFileUpload } from "@/modules/content/media.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/**
 * Adds a link, or starts a file upload: the response carries the URL the
 * browser uploads to; POST /admin/media/{assetId}/complete then publishes it.
 */
export const POST = withApi<{ lessonId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.manage" });
  const lessonId = parseIdParam((await params).lessonId);
  const input = await parseJsonBody(request, addResourceBody);
  if (input.kind === "link") {
    return ok(
      await addLinkResource(actor, { lessonId, title: input.title, url: input.url }, meta),
      {
        status: 201,
      },
    );
  }
  return ok(
    await startFileUpload(
      actor,
      {
        lessonId,
        title: input.title,
        filename: input.filename,
        sizeBytes: input.sizeBytes,
        contentType: input.contentType,
      },
      meta,
    ),
    { status: 201 },
  );
});
