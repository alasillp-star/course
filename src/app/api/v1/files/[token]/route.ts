import { getCurrentActor } from "@/modules/identity/current";
import { getEnv } from "@/server/env";
import { contentDisposition } from "@/server/http/content-disposition";
import { AppError } from "@/server/http/errors";
import { withApi } from "@/server/http/api";
import { verifyUrlToken } from "@/server/signed-token";
import { LocalStorage, type LocalFileToken } from "@/server/storage/local";

/** Development file storage: expiring, viewer-bound download (always as an attachment). */
export const GET = withApi<{ token: string }>(async (_request, { params }) => {
  if (getEnv().STORAGE_PROVIDER !== "local") throw new AppError("NOT_FOUND");
  const data = verifyUrlToken<LocalFileToken>("local-file", (await params).token);
  if (!data) throw new AppError("FORBIDDEN");
  if (data.viewerId) {
    const actor = await getCurrentActor();
    if (!actor || actor.userId !== data.viewerId) throw new AppError("FORBIDDEN");
  }
  const opened = await new LocalStorage(getEnv().LOCAL_STORAGE_DIR).openObject(data.key);
  if (!opened) throw new AppError("NOT_FOUND");
  return new Response(opened.stream, {
    headers: {
      "Content-Type": data.contentType,
      "Content-Length": String(opened.info.sizeBytes),
      "Content-Disposition": contentDisposition(data.filename),
      "Cache-Control": "private, no-store",
    },
  });
});
