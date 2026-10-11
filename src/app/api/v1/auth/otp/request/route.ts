import { z } from "zod";
import { requestLoginCode } from "@/modules/identity/auth.service";
import { emailSchema } from "@/modules/identity/email";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { localeSchema } from "@/server/http/schemas";

const Body = z.object({ email: emailSchema, locale: localeSchema });

/** Sends a sign-in code. Same response whether or not the e-mail has an account. */
export const POST = withApi(async (request, { meta }) => {
  const body = await parseJsonBody(request, Body);
  const result = await requestLoginCode({ email: body.email, locale: body.locale, meta });
  return ok(result);
});
