import { randomBytes } from "node:crypto";

/**
 * Prints fresh, independent secrets for a new environment's configuration:
 * the three platform keys, the two integration tokens and the cron secret.
 * Paste them into the host's secret store (e.g. Vercel → Settings → Environment Variables).
 */
for (const name of ["AUTH_SECRET", "ACTIVATION_CODE_PEPPER", "DATA_ENCRYPTION_KEY"]) {
  console.log(`${name}=${randomBytes(32).toString("base64")}`);
}
for (const name of ["ORDERS_INTEGRATION_TOKEN", "DELIVERY_WEBHOOK_TOKEN", "CRON_SECRET"]) {
  console.log(`${name}=${randomBytes(24).toString("hex")}`);
}
