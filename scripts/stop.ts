import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { inCodespace } from "./_codespace";

/** Stops the background server started by `npm run codespace` (npm run stop). */
const PID_FILE = path.join(process.cwd(), ".data", "server.pid");

if (inCodespace()) {
  // Also stops a server started another way (npm run dev, try, start) in this codespace.
  spawnSync("pkill", ["-f", "next-server|next start|next dev"], { stdio: "ignore" });
}
if (!existsSync(PID_FILE)) {
  console.log(
    inCodespace()
      ? "✓ Platform stopped."
      : "No background platform server is recorded (.data/server.pid).",
  );
  process.exit(0);
}
const pid = Number(readFileSync(PID_FILE, "utf8"));
try {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    // The server was started detached: it leads its own process group.
    process.kill(-pid, "SIGTERM");
  }
  console.log("✓ Platform stopped.");
} catch {
  console.log("The platform was not running.");
}
rmSync(PID_FILE, { force: true });
