import { ingestLandingOrder } from "@/modules/commerce/orders.service";
import { ok, withApi } from "@/server/http/api";
import { assertIntegrationAuth, readIntegrationJson } from "@/server/http/integration-auth";
import { getEnv } from "@/server/env";
import { enforceRateLimit } from "@/server/rate-limit";

/**
 * Orders from the landing site (server-to-server, shared token; see
 * docs/INTEGRATIONS.md). Idempotent on the landing site's order id.
 */
export const POST = withApi(
  async (request, { meta }) => {
    await enforceRateLimit("integration:ip", meta.ip);
    assertIntegrationAuth(request, { token: getEnv().ORDERS_INTEGRATION_TOKEN });
    const { json } = await readIntegrationJson(request);
    const result = await ingestLandingOrder(json, meta);
    return ok(result, { status: result.created ? 201 : 200 });
  },
  { csrf: false },
);
