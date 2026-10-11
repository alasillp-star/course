import { listStaff } from "@/modules/access/rbac.service";
import { requireApiActor } from "@/modules/identity/current";
import { getDb } from "@/server/db/client";
import { ok, withApi } from "@/server/http/api";

export const GET = withApi(async () => {
  const actor = await requireApiActor({ adminArea: true, permission: "staff.read" });
  return ok(await listStaff(getDb(), actor));
});
