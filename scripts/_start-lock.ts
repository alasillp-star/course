import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * One start at a time (npm run codespace runs on every attach of the codespace).
 * mkdir is atomic: the first caller owns the lock until it exits; others wait
 * while its owner is alive. A stale lock (owner killed) is taken over.
 */
export async function acquireStartLock(lockDir: string, maxWaitMs = 15 * 60 * 1000): Promise<void> {
  mkdirSync(path.dirname(lockDir), { recursive: true });
  const pidFile = path.join(lockDir, "pid");
  let announced = false;
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    try {
      mkdirSync(lockDir);
      writeFileSync(pidFile, String(process.pid));
      const release = () => {
        try {
          if (readFileSync(pidFile, "utf8") === String(process.pid)) {
            rmSync(lockDir, { recursive: true, force: true });
          }
        } catch {
          // already gone
        }
      };
      process.on("exit", release);
      for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
        process.on(signal, () => {
          release();
          process.exit(130);
        });
      }
      return;
    } catch {
      let owner = 0;
      try {
        owner = Number(readFileSync(pidFile, "utf8"));
      } catch {
        // being created right now, or left without a pid
      }
      const fresh = existsSync(lockDir) && Date.now() - statSync(lockDir).mtimeMs < 5000;
      if ((owner && !alive(owner)) || (!owner && !fresh) || Date.now() > deadline) {
        rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
      if (!announced) {
        console.log("▸ The platform is already being started in another terminal: waiting…");
        announced = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
