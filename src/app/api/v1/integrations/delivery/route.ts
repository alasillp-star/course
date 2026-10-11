import { handleDeliveryWebhook } from "@/modules/commerce/orders.service";
import { ok, withApi } from "@/server/http/api";
import { assertIntegrationAuth, readIntegrationJson } from "@/server/http/integration-auth";
import { getEnv } from "@/server/env";
import { enforceRateLimit } from "@/server/rate-limit";

/**
 * Parcel status updates from the delivery company (or from the system that
 * relays them). Unknown parcels and labels are acknowledged (200) and logged,
 * so the sender does not retry them forever; see the per-message `outcome`.
 */
export const POST = withApi(
  async (request, { meta }) => {
    await enforceRateLimit("integration:ip", meta.ip);
    const env = getEnv();
    const { rawBody, json } = await readIntegrationJson(request);
    assertIntegrationAuth(request, {
      token: env.DELIVERY_WEBHOOK_TOKEN,
      hmacSecret: env.DELIVERY_WEBHOOK_SECRET,
      rawBody,
    });
    return ok(await handleDeliveryWebhook(json, meta));
  },
  { csrf: false },
);

/** URL check used by some webhook dashboards (echoes a `crc_token` challenge when given). */
export const GET = withApi(
  async (request, { meta }) => {
    await enforceRateLimit("integration:ip", meta.ip);
    assertIntegrationAuth(request, { token: getEnv().DELIVERY_WEBHOOK_TOKEN });
    const challenge = request.nextUrl.searchParams.get("crc_token");
    if (challenge && /^[\w.-]{1,200}$/.test(challenge)) {
      return new Response(challenge, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return ok({ ok: true });
  },
  { csrf: false },
);
