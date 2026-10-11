import { z } from "zod";
import { requireApiActor } from "@/modules/identity/current";
import { confirmTotpEnrollment } from "@/modules/identity/mfa.service";
import { AppError } from "@/server/http/errors";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { otpCodeSchema } from "@/server/http/schemas";

const Body = z.object({ code: otpCodeSchema });

/** Confirms enrolment and returns single-use recovery codes (shown once). */
export const POST = withApi(async (request, { meta }) => {
  const actor = await requireApiActor();
  if (!actor.isStaff) throw new AppError("FORBIDDEN");
  const { code } = await parseJsonBody(request, Body);
  const { recoveryCodes } = await confirmTotpEnrollment(actor, code, meta);
  return ok({ recoveryCodes });
});
