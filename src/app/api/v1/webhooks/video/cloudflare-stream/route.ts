import { handleVideoWebhook } from "@/modules/content/media.service";
import { AppError } from "@/server/http/errors";
import { ok, withApi } from "@/server/http/api";

const MAX_BODY = 1024 * 1024;

/** Cloudflare Stream webhook. Authenticated by its HMAC signature (no cookies, no CSRF check). */
export const POST = withApi(
  async (request) => {
    if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY) {
      throw new AppError("INVALID_REQUEST", "Body too large");
    }
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY) throw new AppError("INVALID_REQUEST", "Body too large");
    return ok(await handleVideoWebhook("cloudflare_stream", rawBody, request.headers));
  },
  { csrf: false },
);
