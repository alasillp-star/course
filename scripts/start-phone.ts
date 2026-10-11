import { spawn, spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import QRCode from "qrcode";

/**
 * Serves the platform to phones on the same Wi-Fi (local trial):
 *   npm run start:phone
 * Builds the app, then starts it on 0.0.0.0 with APP_URL set to this
 * computer's network address — so the QR codes of cards downloaded meanwhile
 * open on a phone — and prints a QR code of the site in the terminal.
 * .env.local is not modified.
 */
const PORT = Number(process.env.PORT ?? 3000);
const isWindows = process.platform === "win32";

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

async function main() {
  const ip = lanAddress();
  if (!ip) {
    console.error("✗ No network connection found. Connect this computer to Wi-Fi.");
    process.exit(1);
  }
  const url = `http://${ip}:${PORT}`;
  const env = { ...process.env, APP_URL: url };

  console.log(`▸ Building the platform for ${url} (1–2 minutes)…`);
  const build = spawnSync("npm", ["run", "build"], { env, shell: isWindows, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);

  console.log(`
────────────────────────────────────────────────────────────────────
 Open on your phone (same Wi-Fi): ${url}/ar
 Admin: ${url}/ar/login
 Cards downloaded now (Admin → Activation cards → PDF) open on phones.
 If the phone cannot connect, allow Node.js in the computer's firewall.
────────────────────────────────────────────────────────────────────`);
  console.log(await QRCode.toString(`${url}/ar`, { type: "terminal", small: true }));

  const server = spawn("npm", ["run", "start", "--", "-H", "0.0.0.0", "-p", String(PORT)], {
    env,
    shell: isWindows,
    stdio: "inherit",
  });
  server.on("exit", (code) => process.exit(code ?? 0));
}

void main();
