import { defineConfig, devices } from "@playwright/test";
import { DELIVERY_TOKEN, ORDERS_TOKEN } from "./tests/e2e/support";

/**
 * End-to-end tests against a production build (`next build` + `next start`)
 * and a dedicated database (E2E_DATABASE_URL, default: local academy_e2e),
 * reset and bootstrapped before the server starts. Secrets are fixed test-only
 * values. E-mails go to the dev outbox, where tests read OTP codes.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export const e2eEnv = {
  APP_ENV: "test",
  APP_URL: BASE_URL,
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ??
    "postgres://academy:academy_dev_password@127.0.0.1:5432/academy_e2e",
  AUTH_SECRET: Buffer.alloc(32, 11).toString("base64"),
  ACTIVATION_CODE_PEPPER: Buffer.alloc(32, 12).toString("base64"),
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 13).toString("base64"),
  EMAIL_TRANSPORT: "dev-outbox",
  DEV_MAIL_OUTBOX_DIR: ".data/e2e-mailbox",
  BOOTSTRAP_SUPER_ADMIN_EMAIL: "owner@e2e.test",
  STAFF_MFA_REQUIRED: "true",
  NEXT_TELEMETRY_DISABLED: "1",
  ORDERS_INTEGRATION_TOKEN: ORDERS_TOKEN,
  DELIVERY_WEBHOOK_TOKEN: DELIVERY_TOKEN,
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "mobile",
      dependencies: ["setup"],
      testMatch: /(activation|student|responsive)\.spec\.ts/,
      use: { ...devices["Pixel 7"], locale: "ar" },
    },
    {
      name: "desktop",
      dependencies: ["setup"],
      testMatch: /(admin|security|responsive|delivery)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], locale: "fr" },
    },
  ],
  webServer: {
    command: `npm run e2e:prepare && npm run build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: e2eEnv,
    stdout: "ignore",
    stderr: "pipe",
  },
});
