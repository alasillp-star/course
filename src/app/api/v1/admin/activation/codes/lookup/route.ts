import { z } from "zod";
import { findCardBySerial } from "@/modules/activation/admin-codes.service";
import { requireApiActor } from "@/modules/identity/current";
import { AppError } from "@/server/http/errors";
import { ok, parseSearchParams, withApi } from "@/server/http/api";

const Query = z.object({ serial: z.string().trim().min(3).max(40) });

export const GET = withApi(async (request) => {
  const actor = await requireApiActor({ adminArea: true, permission: "activation.codes.read" });
  const { serial } = parseSearchParams(request, Query);
  const card = await findCardBySerial(actor, serial);
  if (!card) throw new AppError("NOT_FOUND");
  return ok(card);
});
