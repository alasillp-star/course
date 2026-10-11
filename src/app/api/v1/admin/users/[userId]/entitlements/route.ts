import { z } from "zod";
import { grantManually } from "@/modules/entitlements/entitlements.service";
import { requireApiActor } from "@/modules/identity/current";
import { getDb } from "@/server/db/client";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam, reasonSchema, uuidSchema } from "@/server/http/schemas";

const Body = z.object({
  courseId: uuidSchema,
  note: reasonSchema,
  expiresAt: z.iso.datetime({ offset: true }).nullish(),
});

/** Manual access grant (gift, correction, partner). */
export const POST = withApi<{ userId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "entitlements.grant" });
  const body = await parseJsonBody(request, Body);
  const entitlement = await grantManually(
    getDb(),
    actor,
    {
      userId: parseIdParam((await params).userId),
      courseId: body.courseId,
      note: body.note,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
    meta,
  );
  return ok({ id: entitlement.id }, { status: 201 });
});
