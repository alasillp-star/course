import { z } from "zod";
import { startActivation } from "@/modules/activation/redemption.service";
import { emailSchema } from "@/modules/identity/email";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { localeSchema } from "@/server/http/schemas";

const Body = z.object({
  code: z.string().trim().min(1).max(64),
  pin: z.string().trim().max(16).nullish(),
  email: emailSchema,
  locale: localeSchema,
});

/** Verifies the scratch-off PIN and e-mails a confirmation code bound to this card. */
export const POST = withApi(async (request, { meta }) => {
  const body = await parseJsonBody(request, Body);
  return ok(await startActivation({ ...body, meta }));
});
