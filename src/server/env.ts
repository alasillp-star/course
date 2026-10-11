import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once on first use. Validation is lazy so that
 * `next build` can run without production secrets; `instrumentation.ts` calls
 * getEnv() at server start so a misconfigured deployment fails fast.
 */

const secretKey = (name: string, exactBytes?: number) =>
  z
    .string({ error: `${name} is required` })
    .min(1, `${name} is required`)
    .refine((value) => {
      const length = Buffer.from(value, "base64").length;
      return exactBytes ? length === exactBytes : length >= 32;
    }, `${name} must be base64 encoding ${exactBytes ?? "at least 32"} random bytes (openssl rand -base64 32)`);

const booleanish = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const EnvSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    APP_URL: z.url().transform((url) => url.replace(/\/+$/, "")),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    /** Disable for transaction-mode poolers (Supabase Supavisor :6543, PgBouncer). */
    DATABASE_PREPARE: booleanish.default(true),

    AUTH_SECRET: secretKey("AUTH_SECRET"),
    ACTIVATION_CODE_PEPPER: secretKey("ACTIVATION_CODE_PEPPER"),
    DATA_ENCRYPTION_KEY: secretKey("DATA_ENCRYPTION_KEY", 32),
    DATA_ENCRYPTION_KEY_PREVIOUS: secretKey("DATA_ENCRYPTION_KEY_PREVIOUS", 32).optional(),

    EMAIL_TRANSPORT: z.enum(["smtp", "resend", "dev-outbox"]).default("dev-outbox"),
    EMAIL_FROM: z.string().min(3).default("Academy <no-reply@localhost>"),
    EMAIL_REPLY_TO: z.email().optional(),
    SMTP_URL: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    DEV_MAIL_OUTBOX_DIR: z.string().default(".data/mailbox"),

    TRUST_PROXY_HEADERS: booleanish.default(true),
    STAFF_MFA_REQUIRED: booleanish.default(true),
    SESSION_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    /** How long a completed second factor stays valid for the admin area. */
    STAFF_MFA_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    MAX_ACTIVE_SESSIONS_PER_USER: z.coerce.number().int().min(0).max(50).default(5),

    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (env.EMAIL_TRANSPORT === "smtp" && !env.SMTP_URL) {
      issue("SMTP_URL", "SMTP_URL is required when EMAIL_TRANSPORT=smtp");
    }
    if (env.EMAIL_TRANSPORT === "resend" && !env.RESEND_API_KEY) {
      issue("RESEND_API_KEY", "RESEND_API_KEY is required when EMAIL_TRANSPORT=resend");
    }
    if (env.APP_ENV === "production" || env.APP_ENV === "staging") {
      if (env.EMAIL_TRANSPORT === "dev-outbox") {
        issue("EMAIL_TRANSPORT", "dev-outbox only writes e-mails to disk; use smtp or resend");
      }
      if (!env.APP_URL.startsWith("https://")) {
        issue("APP_URL", "must use https:// outside development");
      }
      if (!env.STAFF_MFA_REQUIRED) {
        issue("STAFF_MFA_REQUIRED", "staff MFA cannot be disabled outside development");
      }
      const keys = [env.AUTH_SECRET, env.ACTIVATION_CODE_PEPPER, env.DATA_ENCRYPTION_KEY];
      if (new Set(keys).size !== keys.length) {
        issue("AUTH_SECRET", "AUTH_SECRET, ACTIVATION_CODE_PEPPER and DATA_ENCRYPTION_KEY must differ");
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid server environment configuration:\n${details}`);
  }
  cached = result.data;
  return cached;
}

/** Test helper: forget the memoised environment (after mutating process.env). */
export function resetEnvCache(): void {
  cached = undefined;
}

export function isProductionLike(): boolean {
  const { APP_ENV } = getEnv();
  return APP_ENV === "production" || APP_ENV === "staging";
}
