import "./_env";
import { randomInt } from "node:crypto";

/**
 * Plays the landing page or the delivery company against a running platform,
 * through the real integration endpoints and tokens from .env.local:
 *
 *   npm run simulate -- order [TRACKING]               a landing-page order (new tracking number by default)
 *   npm run simulate -- delivery <TRACKING> [STATUS]    a carrier update (default "Livré")
 *
 * Examples of carrier statuses: "En transit", "Sorti en livraison", "Non livré",
 * "Livré", "Retourné". Option --url=https://your-domain to target a deployment.
 */
const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--url="));
const urlFlag = process.argv.find((arg) => arg.startsWith("--url="))?.slice("--url=".length);
const baseUrl = (urlFlag ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const [command, ...rest] = args;

function usage(): never {
  console.log(`Usage:
  npm run simulate -- order [TRACKING]
  npm run simulate -- delivery <TRACKING> [STATUS]   (default status: "Livré")`);
  process.exit(1);
}

async function post(path: string, token: string | undefined, tokenName: string, body: unknown) {
  if (!token) {
    console.error(`✗ ${tokenName} is not set in .env.local (run: npm run setup)`);
    process.exit(1);
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    console.error(
      `✗ ${baseUrl} does not answer. Start the platform first (npm run dev or npm run try).`,
    );
    process.exit(1);
  }
  const payload = (await response.json().catch(() => null)) as {
    data?: Record<string, unknown>;
    error?: { code?: string; details?: unknown };
  } | null;
  if (!response.ok) {
    console.error(`✗ HTTP ${response.status}`, JSON.stringify(payload?.error ?? payload));
    process.exit(1);
  }
  return payload?.data ?? {};
}

async function main() {
  if (command === "order") {
    const tracking = rest[0] ?? `TEST-${randomInt(1000, 9999)}`;
    const orderId = `sim-${Date.now().toString(36)}`;
    const data = await post(
      "/api/v1/integrations/orders",
      process.env.ORDERS_INTEGRATION_TOKEN,
      "ORDERS_INTEGRATION_TOKEN",
      {
        order_id: orderId,
        full_name: "Client Test (simulation)",
        phone: `05${randomInt(10_000_000, 99_999_999)}`,
        wilaya: "16 - Alger",
        commune: "Hydra",
        address: "Rue de test",
        product: "Formation e-commerce",
        total: 4900,
        shipping_fee: 400,
        tracking_number: tracking,
        carrier: "Simulation",
      },
    );
    console.log(`✓ order ${String(data.orderNumber)} received (landing-page id ${orderId})
  tracking number: ${tracking}

Next:
  1. Admin → Orders → ${String(data.orderNumber)}: pack an available card (e.g. B0001-00013)
  2. Open that card's link (printer CSV of the batch): "waiting for delivery confirmation"
  3. npm run simulate -- delivery ${tracking}        → the card works`);
    return;
  }
  if (command === "delivery") {
    const tracking = rest[0];
    if (!tracking) usage();
    const status = rest.slice(1).join(" ") || "Livré";
    const data = await post(
      "/api/v1/integrations/delivery",
      process.env.DELIVERY_WEBHOOK_TOKEN,
      "DELIVERY_WEBHOOK_TOKEN",
      { tracking, status, occurred_at: new Date().toISOString() },
    );
    const [result] = (data.results as Array<Record<string, unknown>> | undefined) ?? [];
    console.log(`✓ carrier update "${status}" for ${tracking}`);
    console.log(`  outcome: ${String(result?.outcome)}  status: ${String(result?.status ?? "-")}`);
    if (result?.outcome === "delivered") {
      console.log(
        `  order ${String(result.orderNumber)} paid, cards unlocked: ${String(result.cardsUnlocked)}`,
      );
    }
    if (result?.outcome === "unknown_tracking") {
      console.log(
        "  no order has this tracking number (create one with: npm run simulate -- order)",
      );
    }
    return;
  }
  usage();
}

void main();
