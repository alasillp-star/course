import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";

/**
 * Finds the Next.js server listening on a port, without external tools
 * (Linux /proc: Codespaces, containers, most servers). Elsewhere it finds
 * nothing and callers fall back to their PID file.
 */
export type ServerProcess = { pid: number; command: string; appUrl?: string };

function listeningInodes(port: number): Set<string> {
  const inodes = new Set<string>();
  const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n").slice(1)) {
      const columns = line.trim().split(/\s+/);
      // local_address is "ADDR:PORT"; state 0A = LISTEN; inode is column 9.
      if (columns[1]?.endsWith(`:${hexPort}`) && columns[3] === "0A" && columns[9]) {
        inodes.add(columns[9]);
      }
    }
  }
  return inodes;
}

export function serversOnPort(port: number): ServerProcess[] {
  if (process.platform !== "linux" || !existsSync("/proc")) return [];
  const inodes = listeningInodes(port);
  if (inodes.size === 0) return [];
  const found: ServerProcess[] = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let fds: string[];
    try {
      fds = readdirSync(`/proc/${entry}/fd`);
    } catch {
      continue; // another user's process
    }
    const listens = fds.some((fd) => {
      try {
        const target = readlinkSync(`/proc/${entry}/fd/${fd}`);
        return target.startsWith("socket:[") && inodes.has(target.slice(8, -1));
      } catch {
        return false;
      }
    });
    if (!listens) continue;
    const read = (name: string) => {
      try {
        return readFileSync(`/proc/${entry}/${name}`, "utf8");
      } catch {
        return "";
      }
    };
    const command = read("cmdline").split("\0").join(" ").trim();
    const appUrl = read("environ")
      .split("\0")
      .find((line) => line.startsWith("APP_URL="))
      ?.slice("APP_URL=".length);
    found.push({ pid: Number(entry), command, appUrl });
  }
  return found;
}

/** Signals the Next.js servers listening on `port` (never other programs); returns how many. */
export function stopNextServersOnPort(port: number, signal: NodeJS.Signals = "SIGTERM"): number {
  let stopped = 0;
  for (const server of serversOnPort(port)) {
    if (!/next/i.test(server.command)) continue;
    try {
      process.kill(server.pid, signal);
      stopped += 1;
    } catch {
      // already gone
    }
  }
  return stopped;
}

/** Stops them and waits (up to ~10 s, then SIGKILL) until the port is free of them. */
export async function stopNextServersAndWait(port: number): Promise<number> {
  const stopped = stopNextServersOnPort(port);
  for (let i = 0; i < 20 && serversOnPort(port).some((s) => /next/i.test(s.command)); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stopNextServersOnPort(port, "SIGKILL");
  return stopped;
}
