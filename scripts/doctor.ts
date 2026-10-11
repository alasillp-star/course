import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { codespaceUrl, fromSharedFiles } from "./_codespace";
import { serversOnPort } from "./_server-process";

/**
 * One screen to diagnose a trial installation (npm run doctor): Codespaces
 * detection, configured address, what is listening on the platform's port
 * and with which address, health, and the end of the server log. Prints no
 * secret values.
 */
const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.cwd();
const yes = (value: unknown) => (value ? "yes" : "NO");

const envFile = path.join(ROOT, ".env.local");
const envText = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const configured = /^APP_URL=(.*)$/m.exec(envText)?.[1]?.trim();
const shared = fromSharedFiles();

console.log("── Abdou Academy · diagnostic ──────────────────────────────");
console.log(`CODESPACES                 ${process.env.CODESPACES ?? "-"}`);
console.log(`CODESPACE_NAME (env)       ${process.env.CODESPACE_NAME ?? "-"}`);
console.log(
  `forwarding domain (env)    ${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? "-"}`,
);
console.log(`shared files               name=${shared.name ?? "-"} domain=${shared.domain ?? "-"}`);
console.log(`expected address           ${codespaceUrl(PORT) ?? "(not a codespace)"}`);
console.log(`.env.local exists          ${yes(envText)}`);
console.log(`APP_URL in .env.local      ${configured ?? "-"}`);
const servers = serversOnPort(PORT);
if (servers.length === 0) console.log(`port ${PORT}                  nothing listening`);
for (const server of servers) {
  console.log(`port ${PORT} process           pid ${server.pid}: ${server.command.slice(0, 80)}`);
  console.log(`  its APP_URL              ${server.appUrl ?? "(from .env.local)"}`);
}
async function finish() {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/health`);
    console.log(`health                     ${response.status} ${await response.text()}`);
  } catch {
    console.log("health                     no answer");
  }
  const log = path.join(ROOT, ".data", "server.log");
  if (existsSync(log)) {
    const lines = readFileSync(log, "utf8").trim().split("\n").slice(-8);
    console.log("last server log lines:");
    for (const line of lines) console.log(`  ${line.slice(0, 160)}`);
  }
  console.log("─────────────────────────────────────────────────────────────");
}

void finish();
