import { z } from "zod";
import { listStudents } from "@/modules/identity/admin-users.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseSearchParams, withApi } from "@/server/http/api";
import { paginationSchema } from "@/server/http/schemas";
import { USER_STATUSES } from "@/shared/enums";

const Query = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(USER_STATUSES).optional(),
  access: z.enum(["with", "without"]).optional(),
});

export const GET = withApi(async (request) => {
  const actor = await requireApiActor({ adminArea: true, permission: "users.read" });
  return ok(await listStudents(actor, parseSearchParams(request, Query)));
});
