import { z } from "zod";
import { revokeEntitlement } from "@/modules/entitlements/entitlements.service";
import { requireApiActor } from "@/modules/identity/current";
import { getDb } from "@/server/db/client";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam, reasonSchema } from "@/server/http/schemas";

const Body = z.object({ reason: reasonSchema });

export const POST = withApi<{ entitlementId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "entitlements.revoke" });
  const { reason } = await parseJsonBody(request, Body);
  await revokeEntitlement(
    getDb(),
    actor,
    { entitlementId: parseIdParam((await params).entitlementId), reason },
    meta,
  );
  return ok({ revoked: true });
});
