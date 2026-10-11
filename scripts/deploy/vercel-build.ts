import { spawnSync } from "node:child_process";

/**
 * Vercel build (`vercel-build` in package.json): production deployments check
 * the configuration, apply pending migrations and the idempotent seed before
 * building, so a deploy needs no manual database step and a misconfigured one
 * fails before going live. Preview deployments only build, unless
 * MIGRATE_ON_BUILD=true (use a separate preview database for that).
 */
const migrate = process.env.VERCEL_ENV === "production" || process.env.MIGRATE_ON_BUILD === "true";

function run(script: string) {
  const result = spawnSync("npm", ["run", script], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.VERCEL_ENV === "production") run("env:check");
if (migrate) {
  run("db:migrate");
  run("db:seed");
} else {
  console.log("▸ preview build: database migrations skipped (MIGRATE_ON_BUILD=true to enable)");
}
run("build");
