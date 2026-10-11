import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { stopNextServersAndWait } from "./_server-process";

/**
 * Stops the platform (npm run stop): the background server started by
 * `npm run codespace`, and any Next.js server on the platform's port
 * (e.g. one started with npm run dev / try / start).
 */
const PORT = Number(process.env.PORT ?? 3000);
const PID_FILE = path.join(process.cwd(), ".data", "server.pid");

let stopped = false;
if (existsSync(PID_FILE)) {
  const pid = Number(readFileSync(PID_FILE, "utf8"));
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      // Started detached: it leads its own process group.
      process.kill(-pid, "SIGTERM");
    }
    stopped = true;
  } catch {
    // not running any more
  }
  rmSync(PID_FILE, { force: true });
}
// Also any Next.js server on the port; waits until it is free for a following start.
void stopNextServersAndWait(PORT).then((count) => {
  console.log(stopped || count > 0 ? "✓ Platform stopped." : "The platform was not running.");
});
