import { z } from "zod";
import { checkActivationCode } from "@/modules/activation/redemption.service";
import { ok, parseJsonBody, withApi } from "@/server/http/api";

// The code arrives in the JSON body (never in the URL) so it stays out of logs.
const Body = z.object({ code: z.string().trim().min(1).max(64) });

/** Is this card redeemable? Answers with a precise status for the activation page. */
export const POST = withApi(async (request, { meta }) => {
  const { code } = await parseJsonBody(request, Body);
  return ok(await checkActivationCode({ code, meta }));
});
