import { getStudentDetail } from "@/modules/identity/admin-users.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

export const GET = withApi<{ userId: string }>(async (_request, { params }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "users.read" });
  return ok(await getStudentDetail(actor, parseIdParam((await params).userId)));
});
