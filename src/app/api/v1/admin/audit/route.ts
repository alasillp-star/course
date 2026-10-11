import { z } from "zod";
import { queryAuditLog } from "@/modules/audit/audit-query.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseSearchParams, withApi } from "@/server/http/api";
import { paginationSchema } from "@/server/http/schemas";

const Query = paginationSchema.extend({
  action: z.string().trim().max(80).optional(),
  actorEmail: z.string().trim().max(254).optional(),
  targetType: z.string().trim().max(60).optional(),
  targetId: z.string().trim().max(80).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export const GET = withApi(async (request) => {
  const actor = await requireApiActor({ adminArea: true, permission: "audit.read" });
  const query = parseSearchParams(request, Query);
  return ok(
    await queryAuditLog(actor, {
      ...query,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    }),
  );
});
