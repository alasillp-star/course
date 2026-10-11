/**
 * Browser-side JSON API client. Same-origin only; cookies carry the session.
 * Errors surface as ApiError with the server's stable error code.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export async function api<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", 0);
  }
  const payload = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; details?: Record<string, unknown> };
  } | null;
  if (!response.ok) {
    throw new ApiError(
      payload?.error?.code ?? "INTERNAL_ERROR",
      response.status,
      payload?.error?.details ?? {},
    );
  }
  return payload?.data as T;
}
