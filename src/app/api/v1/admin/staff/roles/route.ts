import { z } from "zod";
import { grantRole, revokeRole } from "@/modules/access/rbac.service";
import { ensureStaffAccount, findUserIdByEmail } from "@/modules/identity/admin-users.service";
import { requireApiActor } from "@/modules/identity/current";
import { emailSchema } from "@/modules/identity/email";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { SYSTEM_ROLES } from "@/shared/enums";

const Body = z.object({
  email: emailSchema,
  roleKey: z.enum(SYSTEM_ROLES).refine((role) => role !== "student", "student is not a staff role"),
});

/** Grants a staff role, inviting the person (unverified account) if needed. */
export const POST = withApi(async (request, { meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "staff.manage" });
  const body = await parseJsonBody(request, Body);
  const userId = await ensureStaffAccount(actor, body.email, meta);
  await grantRole(getDb(), actor, { userId, roleKey: body.roleKey }, meta);
  return ok({ granted: true });
});

export const DELETE = withApi(async (request, { meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "staff.manage" });
  const body = await parseJsonBody(request, Body);
  const userId = await findUserIdByEmail(actor, body.email);
  if (!userId) throw new AppError("NOT_FOUND");
  await revokeRole(getDb(), actor, { userId, roleKey: body.roleKey }, meta);
  return ok({ revoked: true });
});
