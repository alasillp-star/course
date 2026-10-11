import { requireApiActor } from "@/modules/identity/current";
import { getResourceDownloadUrl } from "@/modules/learning/lesson.service";
import { withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/**
 * Downloads a lesson file: checks course access, then redirects to a
 * five-minute URL (presigned S3 URL, or our own signed URL in development).
 */
export const GET = withApi<{ lessonId: string; resourceId: string }>(
  async (_request, { params }) => {
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
        // Kept as given (presigned absolute URL, or a relative path in development):
        // request.url is the server's bind address (0.0.0.0 / localhost), not the
        // address the browser used behind a proxy such as GitHub Codespaces.
        Location: target,
        "Referrer-Policy": "no-referrer",
      },
    });
  },
  { sameSiteOnly: true },
);
