/**
 * One command to get a working local academy (development only):
 *
 *   npm run try                  configure + prepare the database + start http://localhost:3000
 *   npm run setup                the same, without starting the server
 *   npm run setup -- --reset     wipe the local database and recreate the demo data
 *
 * Idempotent:
 *  1. writes .env.local — secrets and integration tokens are generated here;
 *     a value already present in .env.local is never changed,
 *  2. starts PostgreSQL + Mailpit (the e-mail inbox for codes) with Docker,
 *  3. applies migrations, seeds the platform and, on the first run, demo data,
 *  4. prints where to sign in and what to try (demo card links are kept in
 *     .data/demo-data.txt).
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, ".env.local");
const DATA_DIR = path.join(ROOT, ".data");
const DEMO_FILE = path.join(DATA_DIR, "demo-data.txt");
const LOCAL_DB = "postgres://academy:academy_dev_password@127.0.0.1:5432/academy_dev";
const MAILPIT_SMTP = "smtp://127.0.0.1:1025";
const MAILPIT_UI = "http://localhost:8025";

const flags = new Set(process.argv.slice(2));
const isWindows = process.platform === "win32";

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function step(message: string) {
  console.log(`\n▸ ${message}`);
}

/** Runs an npm script; with `capture`, also returns its standard output. */
function npmRun(script: string, capture = false): string {
  const result = spawnSync("npm", ["run", "--silent", script], {
    cwd: ROOT,
    shell: isWindows,
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
  });
  if (result.status !== 0) fail(`"npm run ${script}" failed (see the messages above).`);
  return result.stdout ?? "";
}

/** Public URL of a forwarded port when running in GitHub Codespaces. */
function codespaceUrl(port: number): string | undefined {
  const name = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  return name && domain ? `https://${name}-${port}.${domain}` : undefined;
}

function dockerAvailable(): boolean {
  const result = spawnSync("docker", ["compose", "version"], { shell: isWindows, stdio: "ignore" });
  return result.status === 0;
}

// .env.local -----------------------------------------------------------------------

const secret = () => randomBytes(32).toString("base64");
const token = () => randomBytes(24).toString("hex");

function envValue(content: string, key: string): string | undefined {
  const match = new RegExp(`^${key}=(.*)$`, "m").exec(content);
  return match ? match[1]!.trim().replace(/^"(.*)"$/, "$1") : undefined;
}

/**
 * Sets `key` unless it already has a value. `force` (fresh file from the
 * template) also replaces the template's own defaults.
 */
function setEnv(content: string, key: string, value: string, force: boolean): string {
  const active = new RegExp(`^${key}=(.*)$`, "m");
  const match = active.exec(content);
  if (match) {
    if (match[1]!.trim() !== "" && !force) return content;
    return content.replace(active, () => `${key}=${value}`);
  }
  const commented = new RegExp(`^#\\s*${key}=.*$`, "m");
  if (commented.test(content)) return content.replace(commented, () => `${key}=${value}`);
  return `${content.replace(/\n*$/, "\n")}${key}=${value}\n`;
}

function prepareEnvFile(useDocker: boolean): string {
  const fresh = !existsSync(ENV_FILE);
  const template = path.join(ROOT, ".env.example");
  let content = fresh
    ? existsSync(template)
      ? readFileSync(template, "utf8")
      : ""
    : readFileSync(ENV_FILE, "utf8");
  const before = content;

  const defaults: Array<[string, string]> = [
    ["APP_ENV", "development"],
    ["APP_URL", "http://localhost:3000"],
    ["DATABASE_URL", LOCAL_DB],
    ["EMAIL_TRANSPORT", useDocker ? "smtp" : "dev-outbox"],
    ...(useDocker ? ([["SMTP_URL", MAILPIT_SMTP]] as Array<[string, string]>) : []),
    ["BOOTSTRAP_SUPER_ADMIN_EMAIL", "owner@academy.test"],
    ["VIDEO_PROVIDER", "local"],
    ["STORAGE_PROVIDER", "local"],
  ];
  for (const [key, value] of defaults) content = setEnv(content, key, value, fresh);
  // Generated values: only filled when empty, never replaced.
  for (const key of ["AUTH_SECRET", "ACTIVATION_CODE_PEPPER", "DATA_ENCRYPTION_KEY"]) {
    content = setEnv(content, key, secret(), false);
  }
  for (const key of ["ORDERS_INTEGRATION_TOKEN", "DELIVERY_WEBHOOK_TOKEN"]) {
    content = setEnv(content, key, token(), false);
  }

  if (envValue(content, "APP_ENV") === "production" || envValue(content, "APP_ENV") === "staging") {
    fail(".env.local has APP_ENV=production/staging: this setup is for a local trial only.");
  }
  if (content !== before || fresh) {
    writeFileSync(ENV_FILE, content, { mode: 0o600 });
    console.log(
      fresh ? "  ✓ .env.local created" : "  ✓ .env.local completed (existing values kept)",
    );
  } else {
    console.log("  ✓ .env.local already complete");
  }
  return content;
}

// Database ---------------------------------------------------------------------------

async function canConnect(url: string): Promise<boolean> {
  const client = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.end({ timeout: 1 }).catch(() => undefined);
  }
}

async function waitForDatabase(url: string, seconds: number): Promise<boolean> {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await canConnect(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

async function hasDemoData(url: string): Promise<boolean> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [row] = await client<
      { count: number }[]
    >`select count(*)::int as count from activation_batches`;
    return (row?.count ?? 0) > 0;
  } finally {
    await client.end({ timeout: 1 });
  }
}

// Main ---------------------------------------------------------------------------------

async function main() {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 11)) {
    fail(
      `Node.js 22.11 or newer is required (found ${process.versions.node}). Install it from https://nodejs.org`,
    );
  }

  const docker = dockerAvailable() && existsSync(path.join(ROOT, "docker-compose.yml"));
  step("Configuration");
  const env = prepareEnvFile(docker);
  const databaseUrl = envValue(env, "DATABASE_URL") ?? LOCAL_DB;
  const usesMailpit =
    envValue(env, "EMAIL_TRANSPORT") === "smtp" && envValue(env, "SMTP_URL") === MAILPIT_SMTP;

  step("Database and e-mail inbox");
  if (docker) {
    // The Docker engine may still be starting (Docker Desktop, Codespaces): retry for ~40 s.
    let started = false;
    for (let attempt = 1; attempt <= 5 && !started; attempt += 1) {
      const up = spawnSync("docker", ["compose", "up", "-d"], {
        cwd: ROOT,
        shell: isWindows,
        stdio: "inherit",
      });
      started = up.status === 0;
      if (!started && attempt < 5) await new Promise((resolve) => setTimeout(resolve, 8000));
    }
    if (!started) {
      console.warn("  ! Docker could not start the services. Is Docker Desktop running?");
    }
  }
  if (!(await waitForDatabase(databaseUrl, docker ? 90 : 5))) {
    fail(
      docker
        ? "PostgreSQL did not answer. Start Docker Desktop, then run this command again."
        : "No database: install and start Docker Desktop (https://www.docker.com/products/docker-desktop/), " +
            "or set DATABASE_URL in .env.local to your own PostgreSQL 16, then run this command again.",
    );
  }
  console.log("  ✓ PostgreSQL is ready");

  step(flags.has("--reset") ? "Rebuilding the database" : "Applying migrations");
  npmRun(flags.has("--reset") ? "db:reset" : "db:migrate");
  npmRun("db:seed");

  mkdirSync(DATA_DIR, { recursive: true });
  if (flags.has("--reset") || !(await hasDemoData(databaseUrl))) {
    step("Demo data");
    const output = npmRun("db:seed:dev", true);
    process.stdout.write(output);
    writeFileSync(DEMO_FILE, output);
  } else {
    console.log("\n  ✓ demo data already present (npm run setup -- --reset to start over)");
  }

  // APP_URL from the environment wins (npm run codespace / start:phone set it).
  const appUrl = process.env.APP_URL ?? envValue(env, "APP_URL") ?? "http://localhost:3000";
  const inbox = usesMailpit
    ? (codespaceUrl(8025) ?? MAILPIT_UI)
    : path.join(ROOT, ".data", "mailbox");
  console.log(`
────────────────────────────────────────────────────────────────────
 Abdou Academy is ready
────────────────────────────────────────────────────────────────────
 Platform           ${appUrl}/ar
 Admin sign-in      ${appUrl}/ar/login   →  owner@academy.test
 Sign-in codes      ${inbox}
 Demo cards/orders  ${DEMO_FILE}
 Other staff        admin@ · sales@ · support@ · instructor@academy.test

 Try the delivery flow (in another terminal):
   npm run simulate -- order               a landing-page order arrives
   npm run simulate -- delivery <TRACKING> the carrier reports "Livré"
 Test on your phone (same Wi-Fi):  npm run start:phone
 Guide: docs/TRY_IT.ar.md
────────────────────────────────────────────────────────────────────`);

  if (flags.has("--start")) {
    step(`Starting the platform on ${appUrl} (Ctrl+C to stop)`);
    const child = spawn("npm", ["run", "dev"], { cwd: ROOT, shell: isWindows, stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
  }
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
