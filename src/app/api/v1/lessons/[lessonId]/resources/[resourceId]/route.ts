import { requireApiActor } from "@/modules/identity/current";
import { getResourceDownloadUrl } from "@/modules/learning/lesson.service";
import { withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/**
 * Downloads a lesson file: checks course access, then redirects to a
 * five-minute URL (presigned S3 URL, or our own signed URL in development).
 */
export const GET = withApi<{ lessonId: string; resourceId: string }>(
  async (request, { params }) => {
    const actor = await requireApiActor();
    const { lessonId, resourceId } = await params;
    const target = await getResourceDownloadUrl(
      actor,
      parseIdParam(lessonId),
      parseIdParam(resourceId),
    );
    return new Response(null, {
      status: 302,
      headers: {
        Location: new URL(target, request.url).toString(),
        "Referrer-Policy": "no-referrer",
      },
    });
  },
  { sameSiteOnly: true },
);
