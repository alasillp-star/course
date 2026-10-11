import { z } from "zod";
import { assertRecentAuthentication, requireApiActor } from "@/modules/identity/current";
import { emailSchema } from "@/modules/identity/email";
import { startEmailChange } from "@/modules/identity/email-change.service";
import { ok, parseJsonBody, withApi } from "@/server/http/api";

const Body = z.object({ newEmail: emailSchema });

export const POST = withApi(async (request, { meta }) => {
  const actor = await requireApiActor();
  assertRecentAuthentication(actor);
  const { newEmail } = await parseJsonBody(request, Body);
  return ok(await startEmailChange(actor, { newEmail }, meta));
});
