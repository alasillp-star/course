/**
 * Runs once per server instance. Validates configuration at start-up so a
 * misconfigured deployment fails fast, and centralises error reporting.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { getEnv } = await import("./server/env");
  const env = getEnv();
  const { logger } = await import("./server/logger");
  logger.info("server starting", { appEnv: env.APP_ENV, emailTransport: env.EMAIL_TRANSPORT });
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const { logger } = await import("./server/logger");
  // Plug Sentry / Datadog here (their SDK's captureException) when a DSN is configured.
  logger.error("unhandled request error", {
    path: request.path.split("?")[0],
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    error,
  });
}
