import "../_env";
import { getEnv } from "@/server/env";

/**
 * Validates the configuration exactly as the server does at start-up and
 * prints every problem in one go (`npm run env:check`). Run by vercel-build
 * before production builds, so a misconfigured deploy fails instead of going live.
 */
try {
  const env = getEnv();
  const optional = [
    ["video", env.VIDEO_PROVIDER !== "none"],
    ["lesson files", env.STORAGE_PROVIDER !== "none"],
    ["landing-page orders", !!env.ORDERS_INTEGRATION_TOKEN],
    ["delivery updates", !!env.DELIVERY_WEBHOOK_TOKEN],
    ["daily maintenance (CRON_SECRET)", !!env.CRON_SECRET],
  ] as const;
  console.log(`✓ configuration valid (APP_ENV=${env.APP_ENV}, ${env.APP_URL})`);
  for (const [name, enabled] of optional) {
    console.log(`  ${enabled ? "✓" : "–"} ${name}${enabled ? "" : ": not configured"}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
