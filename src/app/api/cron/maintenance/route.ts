import { runMaintenance } from "@/modules/platform/maintenance.service";
import { safeEqual } from "@/server/crypto";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/http/errors";
import { ok, withApi } from "@/server/http/api";

/**
 * Daily housekeeping for schedulers that call a URL (Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`; see vercel.json). Disabled until
 * CRON_SECRET is set.
 */
export const GET = withApi(async (request) => {
  const secret = getEnv().CRON_SECRET;
  if (!secret) throw new AppError("PROVIDER_NOT_CONFIGURED");
  const presented = /^bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!presented || !safeEqual(presented.trim(), secret)) throw new AppError("UNAUTHENTICATED");
  return ok({ removed: await runMaintenance(getDb()) });
});
