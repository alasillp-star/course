import { existsSync, readFileSync } from "node:fs";

/**
 * GitHub Codespaces detection, shared by the setup and start scripts.
 * Codespaces exposes CODESPACE_NAME and GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
 * when a process does not inherit them, they are read from the codespace's
 * shared environment files.
 */
export function fromSharedFiles(dir = "/workspaces/.codespaces/shared"): {
  name?: string;
  domain?: string;
} {
  const result: { name?: string; domain?: string } = {};
  const envFile = `${dir}/.env`;
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const match = /^(?:export\s+)?([A-Z_]+)=["']?([^"'\s]*)["']?$/.exec(line.trim());
      if (match?.[1] === "CODESPACE_NAME") result.name = match[2];
      if (match?.[1] === "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN") result.domain = match[2];
    }
  }
  const jsonFile = `${dir}/environment-variables.json`;
  if ((!result.name || !result.domain) && existsSync(jsonFile)) {
    try {
      const data = JSON.parse(readFileSync(jsonFile, "utf8")) as Record<string, unknown>;
      if (typeof data.CODESPACE_NAME === "string") result.name ??= data.CODESPACE_NAME;
      if (typeof data.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN === "string") {
        result.domain ??= data.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
      }
    } catch {
      // unreadable: not in a codespace we can describe
    }
  }
  return result;
}

/** https address of a forwarded port in this codespace, or undefined outside Codespaces. */
export function codespaceUrl(port: number): string | undefined {
  let name = process.env.CODESPACE_NAME;
  let domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (!name || !domain) {
    const shared = fromSharedFiles();
    name ||= shared.name;
    domain ||= shared.domain;
  }
  if (name && !domain && process.env.CODESPACES === "true") domain = "app.github.dev";
  return name && domain ? `https://${name}-${port}.${domain}` : undefined;
}

export function inCodespace(): boolean {
  return process.env.CODESPACES === "true" || codespaceUrl(3000) !== undefined;
}
