import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Two projects:
 *  - unit: pure logic, no I/O.
 *  - integration: services against a real PostgreSQL database (TEST_DATABASE_URL,
 *    default: local academy_test). Files run serially because they share it.
 *
 * Secrets below are fixed, test-only values (never used outside tests).
 */
const testEnv = {
  APP_ENV: "test",
  APP_URL: "http://localhost:3000",
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    "postgres://academy:academy_dev_password@127.0.0.1:5432/academy_test",
  DATABASE_POOL_MAX: "12",
  AUTH_SECRET: Buffer.alloc(32, 1).toString("base64"),
  ACTIVATION_CODE_PEPPER: Buffer.alloc(32, 2).toString("base64"),
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
  EMAIL_TRANSPORT: "dev-outbox",
  DEV_MAIL_OUTBOX_DIR: ".data/test-mailbox",
  STAFF_MFA_REQUIRED: "true",
  MAX_ACTIVE_SESSIONS_PER_USER: "5",
  TRUST_PROXY_HEADERS: "true",
  VIDEO_PROVIDER: "local",
  STORAGE_PROVIDER: "local",
  LOCAL_STORAGE_DIR: ".data/test-storage",
};

const shared = {
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside React Server environments; tests are server-side.
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only-stub.ts"),
    },
  },
};

export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          env: testEnv,
        },
      },
      {
        ...shared,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          env: testEnv,
          globalSetup: ["tests/integration/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
