import { z } from "zod";
import { completeActivation } from "@/modules/activation/redemption.service";
import { setSessionCookie } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { localeSchema, otpCodeSchema, uuidSchema } from "@/server/http/schemas";

const Body = z.object({ challengeId: uuidSchema, otp: otpCodeSchema, locale: localeSchema });

/** Confirms the e-mail, redeems the card atomically and signs the student in. */
export const POST = withApi(async (request, { meta }) => {
  const body = await parseJsonBody(request, Body);
  const result = await completeActivation({ challengeId: body.challengeId, otp: body.otp, meta });
  await setSessionCookie(result.token, result.expiresAt);
  return ok({
    accountCreated: result.accountCreated,
    redirectTo: `/${body.locale}/app?welcome=1`,
  });
});
