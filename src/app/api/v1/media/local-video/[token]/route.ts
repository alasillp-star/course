import { getCurrentActor } from "@/modules/identity/current";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/http/errors";
import { withApi } from "@/server/http/api";
import { parseByteRange } from "@/server/http/range";
import { verifyUrlToken } from "@/server/signed-token";
import { LocalStorage } from "@/server/storage/local";
import type { LocalVideoToken } from "@/server/video/local";

/**
 * Development video provider: progressive playback with HTTP ranges. The URL
 * expires and only works in the browser session of the viewer it was issued to.
 */
export const GET = withApi<{ token: string }>(async (request, { params }) => {
  if (getEnv().VIDEO_PROVIDER !== "local") throw new AppError("NOT_FOUND");
  const data = verifyUrlToken<LocalVideoToken>("local-video", (await params).token);
  if (!data) throw new AppError("FORBIDDEN");
  const actor = await getCurrentActor();
  if (!actor || actor.userId !== data.viewerId) throw new AppError("FORBIDDEN");

  const storage = new LocalStorage(getEnv().LOCAL_STORAGE_DIR);
  const info = await storage.head(data.key);
  if (!info) throw new AppError("NOT_FOUND");
  const range = parseByteRange(request.headers.get("range"), info.sizeBytes);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${info.sizeBytes}` },
    });
  }
  const opened = await storage.openObject(data.key, range ?? undefined);
  if (!opened) throw new AppError("NOT_FOUND");
  const headers = new Headers({
    "Content-Type": data.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline",
  });
  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${info.sizeBytes}`);
    headers.set("Content-Length", String(range.end - range.start + 1));
    return new Response(opened.stream, { status: 206, headers });
  }
  headers.set("Content-Length", String(info.sizeBytes));
  return new Response(opened.stream, { status: 200, headers });
});
