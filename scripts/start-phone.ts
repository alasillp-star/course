import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { networkInterfaces } from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import { codespaceUrl } from "./_codespace";
import { serversOnPort, stopNextServersAndWait } from "./_server-process";
import { acquireStartLock } from "./_start-lock";

/**
 * Serves a production build of the platform beyond this computer:
 *
 *   npm run start:phone   phones on the same Wi-Fi (http://<this computer's IP>:3000);
 *                         runs in this terminal, Ctrl+C stops it
 *   npm run codespace     GitHub Codespaces (run automatically when the codespace opens):
 *                         setup + build + server on the codespace's https address, kept
 *                         running in the background — closing the terminal or Ctrl+C
 *                         does not stop it (npm run stop does; log in .data/server.log)
 *
 * APP_URL is set for the server process only (QR codes of cards downloaded
 * meanwhile open on that address); .env.local is not modified. The build is
 * reused while the code has not changed; dependencies are reinstalled when
 * package-lock.json changed (git pull). Only one start runs at a time (the
 * codespace starts one on every attach): a second one waits, then reuses it.
 * The links are printed once the site actually answers.
 */
const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, ".data");
const LOG_FILE = path.join(DATA_DIR, "server.log");
const PID_FILE = path.join(DATA_DIR, "server.pid");
const isWindows = process.platform === "win32";
const withSetup = process.argv.includes("--setup");

function lanAddress(): string | undefined {
  const candidates: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) candidates.push(entry.address);
    }
  }
  const isPrivate = (ip: string) =>
    ip.startsWith("192.168.") || ip.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  return candidates.find(isPrivate) ?? candidates[0];
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitUntilHealthy(seconds: number): Promise<boolean> {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (response.ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

/** Newest modification time among the sources that end up in the build. */
function newestSource(): number {
  let newest = 0;
  const visit = (target: string) => {
    if (!existsSync(target)) return;
    const stat = statSync(target);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(target)) visit(path.join(target, entry));
    } else newest = Math.max(newest, stat.mtimeMs);
  };
  for (const item of ["src", "public", "package.json", "package-lock.json", "next.config.ts"]) {
    visit(path.join(ROOT, item));
  }
  return newest;
}

/** package-lock.json changed since the last install (e.g. after git pull). */
function dependenciesOutdated(): boolean {
  const lock = path.join(ROOT, "package-lock.json");
  const installed = path.join(ROOT, "node_modules", ".package-lock.json");
  if (!existsSync(lock)) return false;
  return !existsSync(installed) || statSync(installed).mtimeMs < statSync(lock).mtimeMs;
}

function npm(args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync("npm", args, { cwd: ROOT, env, shell: isWindows, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function banner(url: string, cloud: boolean) {
  const inbox = codespaceUrl(8025) ?? "http://localhost:8025";
  console.log(`
════════════════════════════════════════════════════════════════════
 ✓ Abdou Academy est en ligne / is running

   Plateforme / Platform     ${url}/ar
   Connexion admin / Admin   ${url}/ar/login   (owner@academy.test)
   Codes de connexion        ${inbox}
${
  cloud
    ? `
   Le serveur tourne en arrière-plan : vous pouvez fermer ce terminal.
   (Ctrl+C ne l'arrête plus. Arrêter : npm run stop · Journal : .data/server.log)
   Ouvrir : Ctrl+clic sur le lien, ou onglet « Ports » → ${PORT} → icône globe.
   Téléphone : scannez le QR code ci-dessous. S'il demande une connexion GitHub :
   onglet « Ports » → ${PORT} → clic droit → Visibilité du port → Public.`
    : `
   Phones on the same Wi-Fi: scan the QR code below.
   If the phone cannot connect, allow Node.js in the computer's firewall.
   Ctrl+C stops the platform.`
}
════════════════════════════════════════════════════════════════════`);
  console.log(await QRCode.toString(`${url}/ar`, { type: "terminal", small: true }));
}

async function main() {
  const cloud = codespaceUrl(PORT);
  if (!cloud && process.env.CODESPACES === "true") {
    console.warn("! Codespace detected, but its address is unknown (CODESPACE_NAME is missing).");
  }
  const ip = cloud ? undefined : lanAddress();
  if (!cloud && !ip) {
    console.error("✗ No network connection found. Connect this computer to Wi-Fi.");
    process.exit(1);
  }
  const url = cloud ?? `http://${ip}:${PORT}`;
  const env = { ...process.env, APP_URL: url };
  await acquireStartLock(path.join(DATA_DIR, "start.lock"));

  const buildId = path.join(ROOT, ".next", "BUILD_ID");
  const buildOutdated = () => !existsSync(buildId) || statSync(buildId).mtimeMs < newestSource();

  if (await portInUse(PORT)) {
    const running = serversOnPort(PORT).find((server) => /next/i.test(server.command));
    const wrongAddress = !!running?.appUrl && running.appUrl !== url;
    if (running && (wrongAddress || buildOutdated() || dependenciesOutdated())) {
      // Started another way (npm run dev / try), an older version, or code updated
      // since (git pull): replace it so the current code runs on the right address.
      console.log(
        wrongAddress
          ? `▸ Restarting the platform on ${url} (it was running on ${running.appUrl})`
          : "▸ Code updated: restarting the platform",
      );
      await stopNextServersAndWait(PORT);
    } else {
      await banner(url, !!cloud);
      return;
    }
  }
  if (dependenciesOutdated()) {
    console.log("\n▸ Installing updated dependencies (1–2 minutes)…");
    npm(["ci", "--no-audit", "--no-fund"], env);
  }
  if (withSetup) npm(["run", "setup"], env);

  if (buildOutdated()) {
    console.log(`\n▸ Building the platform (1–3 minutes)…`);
    npm(["run", "build"], env);
  }

  const codespaceName = cloud ? new URL(cloud).hostname.replace(/-\d+\..*$/, "") : undefined;
  if (codespaceName) {
    // Best effort: lets phones open the site without a GitHub login. The sign-in
    // codes inbox (port 8025) stays private to the codespace owner.
    spawnSync("gh", ["codespace", "ports", "visibility", `${PORT}:public`, "-c", codespaceName], {
      stdio: "ignore",
    });
  }

  const args = ["run", "start", "--", "-H", "0.0.0.0", "-p", String(PORT)];
  if (cloud) {
    // Detached: survives Ctrl+C and closed terminals; stopped by `npm run stop`.
    mkdirSync(DATA_DIR, { recursive: true });
    const log = openSync(LOG_FILE, "a");
    const server = spawn("npm", args, {
      cwd: ROOT,
      env,
      detached: true,
      stdio: ["ignore", log, log],
    });
    server.unref();
    writeFileSync(PID_FILE, String(server.pid));
    console.log("\n▸ Starting the platform…");
    if (!(await waitUntilHealthy(90))) {
      console.error(`✗ The platform did not start. See ${LOG_FILE}`);
      process.exit(1);
    }
    await banner(url, true);
    return;
  }

  const server = spawn("npm", args, { cwd: ROOT, env, shell: isWindows, stdio: "inherit" });
  server.on("exit", (code) => process.exit(code ?? 0));
  if (await waitUntilHealthy(90)) await banner(url, false);
}

void main();
