/**
 * Application error with a stable machine-readable code. API responses expose
 * `code` (clients localise it) and never internal details.
 */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  INVALID_REQUEST: 400,
  UNAUTHENTICATED: 401,
  MFA_REQUIRED: 401,
  REAUTHENTICATION_REQUIRED: 401,
  FORBIDDEN: 403,
  CSRF_REJECTED: 403,
  ACCOUNT_SUSPENDED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  // Auth
  OTP_INVALID: 400,
  OTP_EXPIRED: 400,
  OTP_TOO_MANY_ATTEMPTS: 400,
  MFA_INVALID: 400,
  MFA_ALREADY_ENROLLED: 409,
  MFA_NOT_ENROLLED: 409,
  EMAIL_IN_USE: 409,
  // Activation
  ACTIVATION_CODE_INVALID: 400,
  ACTIVATION_CODE_ALREADY_USED: 409,
  ACTIVATION_CODE_REVOKED: 410,
  ACTIVATION_CODE_NOT_SOLD: 409,
  /** The card belongs to an order whose parcel the carrier has not delivered yet. */
  ACTIVATION_AWAITING_DELIVERY: 409,
  ACTIVATION_CODE_EXPIRED: 410,
  ACTIVATION_CODE_LOCKED: 423,
  ACTIVATION_PIN_INVALID: 400,
  ACTIVATION_PIN_REQUIRED: 400,
  ALREADY_ENTITLED: 409,
  ACTIVATION_SECRETS_PURGED: 409,
  // Learning & media
  COURSE_ACCESS_REQUIRED: 403,
  VIDEO_NOT_READY: 409,
  UPLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  WEBHOOK_SIGNATURE_INVALID: 401,
  PROVIDER_NOT_CONFIGURED: 503,
  INVALID_STATE: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? code);
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Postgres unique-violation detection (SQLSTATE 23505), optionally by constraint name. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = findPgError(error);
  if (!pgError || pgError.code !== "23505") return false;
  return constraint ? pgError.constraint_name === constraint : true;
}

type PgErrorShape = { code?: string; constraint_name?: string };

function findPgError(error: unknown): PgErrorShape | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const candidate = current as PgErrorShape & { cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code))
      return candidate;
    current = candidate.cause;
  }
  return undefined;
}
