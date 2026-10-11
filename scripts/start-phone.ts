import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createConnection } from "node:net";
import { networkInterfaces } from "node:os";
import path from "node:path";
import QRCode from "qrcode";

/**
 * Serves a production build of the platform beyond this computer:
 *
 *   npm run start:phone   phones on the same Wi-Fi (http://<this computer's IP>:3000)
 *   npm run codespace     GitHub Codespaces: setup + build + start on the codespace's
 *                         https address (run automatically when the codespace opens)
 *
 * APP_URL is set for the server process only (QR codes of cards downloaded
 * meanwhile open on that address); .env.local is not modified. The build is
 * reused while the code has not changed.
 */
const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.cwd();
const isWindows = process.platform === "win32";
const withSetup = process.argv.includes("--setup");

function codespaceUrl(port: number): string | undefined {
  const name = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  return name && domain ? `https://${name}-${port}.${domain}` : undefined;
}

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

function npm(args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync("npm", args, { cwd: ROOT, env, shell: isWindows, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main() {
  const cloud = codespaceUrl(PORT);
  const ip = cloud ? undefined : lanAddress();
  if (!cloud && !ip) {
    console.error("✗ No network connection found. Connect this computer to Wi-Fi.");
    process.exit(1);
  }
  const url = cloud ?? `http://${ip}:${PORT}`;
  const env = { ...process.env, APP_URL: url };

  if (await portInUse(PORT)) {
    console.log(`✓ The platform is already running: ${url}/ar`);
    return;
  }
  if (withSetup) npm(["run", "setup"], env);

  const buildId = path.join(ROOT, ".next", "BUILD_ID");
  if (!existsSync(buildId) || statSync(buildId).mtimeMs < newestSource()) {
    console.log(`\n▸ Building the platform (1–3 minutes)…`);
    npm(["run", "build"], env);
  }

  if (cloud && process.env.CODESPACE_NAME) {
    // Best effort: lets phones open the site without a GitHub login. The sign-in
    // codes inbox (port 8025) stays private to the codespace owner.
    spawnSync(
      "gh",
      ["codespace", "ports", "visibility", `${PORT}:public`, "-c", process.env.CODESPACE_NAME],
      {
        stdio: "ignore",
      },
    );
  }

  console.log(`
────────────────────────────────────────────────────────────────────
 Abdou Academy: ${url}/ar
 Admin:         ${url}/ar/login   (owner@academy.test)
 Sign-in codes: ${codespaceUrl(8025) ?? "http://localhost:8025"}
 Cards downloaded now (Admin → Activation cards → PDF) open on phones.
${cloud ? " If a phone asks for a GitHub login: Ports tab → port 3000 → Port Visibility → Public." : " If the phone cannot connect, allow Node.js in the computer's firewall."}
────────────────────────────────────────────────────────────────────`);
  console.log(await QRCode.toString(`${url}/ar`, { type: "terminal", small: true }));

  const server = spawn("npm", ["run", "start", "--", "-H", "0.0.0.0", "-p", String(PORT)], {
    cwd: ROOT,
    env,
    shell: isWindows,
    stdio: "inherit",
  });
  server.on("exit", (code) => process.exit(code ?? 0));
}

void main();
