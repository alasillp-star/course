import { reactivateUser } from "@/modules/identity/admin-users.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

export const POST = withApi<{ userId: string }>(async (_request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "users.suspend" });
  await reactivateUser(actor, parseIdParam((await params).userId), meta);
  return ok({ reactivated: true });
});
