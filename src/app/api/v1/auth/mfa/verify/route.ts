import { z } from "zod";
import { requireApiActor } from "@/modules/identity/current";
import { verifyMfa } from "@/modules/identity/mfa.service";
import { AppError } from "@/server/http/errors";
import { ok, parseJsonBody, withApi } from "@/server/http/api";

const Body = z.object({ code: z.string().trim().min(6).max(16) });

/** Completes the second factor for this session (TOTP or recovery code). */
export const POST = withApi(async (request, { meta }) => {
  const actor = await requireApiActor();
  if (!actor.isStaff) throw new AppError("FORBIDDEN");
  const { code } = await parseJsonBody(request, Body);
  await verifyMfa(actor, code, meta);
  return ok({ verified: true });
});
