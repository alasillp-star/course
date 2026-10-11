import { unlockCard } from "@/modules/activation/admin-codes.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

export const POST = withApi<{ codeId: string }>(async (_request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "activation.codes.unlock" });
  await unlockCard(actor, parseIdParam((await params).codeId), meta);
  return ok({ unlocked: true });
});
