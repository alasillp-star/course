import { z } from "zod";
import { suspendUser } from "@/modules/identity/admin-users.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam, reasonSchema } from "@/server/http/schemas";

const Body = z.object({ reason: reasonSchema });

export const POST = withApi<{ userId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "users.suspend" });
  const { reason } = await parseJsonBody(request, Body);
  await suspendUser(actor, { userId: parseIdParam((await params).userId), reason }, meta);
  return ok({ suspended: true });
});
