import { z } from "zod";
import { assertRecentAuthentication, requireApiActor } from "@/modules/identity/current";
import { confirmEmailChange } from "@/modules/identity/email-change.service";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { otpCodeSchema, uuidSchema } from "@/server/http/schemas";

const Body = z.object({ challengeId: uuidSchema, code: otpCodeSchema });

export const POST = withApi(async (request, { meta }) => {
  const actor = await requireApiActor();
  assertRecentAuthentication(actor);
  const body = await parseJsonBody(request, Body);
  return ok(await confirmEmailChange(actor, body, meta));
});
