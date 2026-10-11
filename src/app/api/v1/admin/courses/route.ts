import { listCourseOptions } from "@/modules/activation/batches.service";
import { canAny } from "@/modules/access/actor";
import { requireApiActor } from "@/modules/identity/current";
import { AppError } from "@/server/http/errors";
import { ok, withApi } from "@/server/http/api";

/** Courses selectable in staff tools (batch creation, manual grants). */
export const GET = withApi(async () => {
  const actor = await requireApiActor({ adminArea: true });
  if (!canAny(actor, ["activation.batches.create", "entitlements.grant", "content.read"])) {
    throw new AppError("FORBIDDEN");
  }
  return ok(await listCourseOptions());
});
