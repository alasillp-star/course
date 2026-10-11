import { requireApiActor } from "@/modules/identity/current";
import { getOverviewMetrics } from "@/modules/reports/overview.service";
import { ok, withApi } from "@/server/http/api";

export const GET = withApi(async () => {
  const actor = await requireApiActor({ adminArea: true, permission: "reports.read" });
  return ok(await getOverviewMetrics(actor));
});
