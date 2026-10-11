import { z } from "zod";
import { completeLogin } from "@/modules/identity/auth.service";
import { setSessionCookie } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { localeSchema, otpCodeSchema, safeRedirectPath, uuidSchema } from "@/server/http/schemas";

const Body = z.object({
  challengeId: uuidSchema,
  code: otpCodeSchema,
  locale: localeSchema,
  next: z.string().max(300).optional(),
});

/** Verifies the code, opens a session (HttpOnly cookie) and returns where to go next. */
export const POST = withApi(async (request, { meta }) => {
  const body = await parseJsonBody(request, Body);
  const result = await completeLogin({ challengeId: body.challengeId, code: body.code, meta });
  await setSessionCookie(result.token, result.expiresAt);
  const home = result.isStaff ? `/${body.locale}/admin` : `/${body.locale}/app`;
  return ok({ redirectTo: safeRedirectPath(body.next, home), isStaff: result.isStaff });
});
