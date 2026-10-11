import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { logger } from "@/server/logger";

/** Liveness/readiness probe for the load balancer and uptime monitoring. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok", database: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("health check failed", { error });
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
