/**
 * Structured JSON logger (stdout/stderr) with mandatory redaction.
 *
 * Anything whose key looks like a secret (codes, PINs, OTPs, tokens, cookies,
 * passwords, keys) is replaced before serialisation, and e-mail addresses are
 * masked, so activation codes and personal data never reach log storage or
 * third-party log drains. Works in Node scripts, route handlers and the proxy.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEY_PATTERN =
  /(^|_|-|\b)(code|pin|otp|token|secret|password|passcode|cookie|authorization|api[-_]?key|key|ciphertext|hash|session)s?$/i;

const EMAIL_PATTERN = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** Masks e-mail addresses inside free text: john.doe@x.com -> j***@x.com */
export function maskEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, "$1***@$2");
}

const NON_SECRET_KEYS = new Set([
  "errorcode",
  "statuscode",
  "code_status",
  "countrycode",
  "localecode",
]);

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return maskEmails(value);
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    const code = (value as { code?: unknown }).code;
    return {
      name: value.name,
      message: maskEmails(value.message),
      // Driver/system error codes (SQLSTATE, ECONNREFUSED) are safe and useful.
      ...(typeof code === "string" && /^[A-Z0-9_]{2,40}$/.test(code) ? { errorCode: code } : {}),
      stack: value.stack?.split("\n").slice(0, 8).join("\n"),
      ...(value.cause ? { cause: redact(value.cause, depth + 1) } : {}),
    };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key) && !NON_SECRET_KEYS.has(key.toLowerCase())) {
      out[key] = "[redacted]";
    } else {
      out[key] = redact(inner, depth + 1);
    }
  }
  return out;
}

function threshold(): number {
  const configured = (process.env.LOG_LEVEL as Level | undefined) ?? "info";
  return LEVEL_ORDER[configured] ?? LEVEL_ORDER.info;
}

function write(level: Level, message: string, fields?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < threshold()) return;
  if (process.env.APP_ENV === "test" && level !== "error" && !process.env.LOG_IN_TESTS) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: maskEmails(message),
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};
