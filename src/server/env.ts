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
    .refine(
      (value) => {
        const length = Buffer.from(value, "base64").length;
        return exactBytes ? length === exactBytes : length >= 32;
      },
      `${name} must be base64 encoding ${exactBytes ?? "at least 32"} random bytes (openssl rand -base64 32)`,
    );

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

    /**
     * Video hosting. `local` streams files from disk for development and tests
     * only; production uses Mux or Cloudflare Stream (signed HLS playback).
     */
    VIDEO_PROVIDER: z.enum(["none", "local", "mux", "cloudflare_stream"]).default("none"),
    MUX_TOKEN_ID: z.string().optional(),
    MUX_TOKEN_SECRET: z.string().optional(),
    MUX_SIGNING_KEY_ID: z.string().optional(),
    /** Base64-encoded PEM private key of a Mux URL signing key. */
    MUX_SIGNING_KEY_PRIVATE: z.string().optional(),
    MUX_WEBHOOK_SECRET: z.string().optional(),
    MUX_PLAYBACK_RESTRICTION_ID: z.string().optional(),
    MUX_VIDEO_QUALITY: z.enum(["basic", "plus", "premium"]).default("basic"),
    CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
    CLOUDFLARE_STREAM_API_TOKEN: z.string().optional(),
    /** The xxxx in https://customer-xxxx.cloudflarestream.com (Stream dashboard). */
    CLOUDFLARE_STREAM_CUSTOMER_CODE: z
      .string()
      .regex(/^[a-z0-9]+$/, "only the code, e.g. f33zs165nr7gyfy4")
      .optional(),
    CLOUDFLARE_STREAM_SIGNING_KEY_ID: z.string().optional(),
    /** Base64-encoded PEM private key (the `pem` field returned by POST /stream/keys). */
    CLOUDFLARE_STREAM_SIGNING_KEY_PEM: z.string().optional(),
    CLOUDFLARE_STREAM_WEBHOOK_SECRET: z.string().optional(),

    /** Files (lesson resources). `local` writes to disk for development and tests only. */
    STORAGE_PROVIDER: z.enum(["none", "local", "s3"]).default("none"),
    /** Omit for AWS S3; set for R2, Supabase Storage, MinIO, Backblaze B2, Wasabi... */
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: booleanish.default(false),
    LOCAL_STORAGE_DIR: z.string().default(".data/storage"),
    MAX_UPLOAD_FILE_MB: z.coerce.number().int().min(1).max(2048).default(50),
    MAX_UPLOAD_VIDEO_MB: z.coerce.number().int().min(1).max(30_000).default(8192),

    /**
     * Integrations. Each token is a shared secret given to ONE sender and kept
     * server-side there (never in a website's front-end code). Unset = endpoint off.
     */
    ORDERS_INTEGRATION_TOKEN: z.string().min(32, "use at least 32 random characters").optional(),
    DELIVERY_WEBHOOK_TOKEN: z.string().min(32, "use at least 32 random characters").optional(),
    /** Optional: also require an HMAC-SHA256 signature of the body on delivery webhooks. */
    DELIVERY_WEBHOOK_SECRET: z.string().min(16).optional(),

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
    const requireAll = (when: boolean, label: string, names: Array<keyof typeof env>) => {
      if (!when) return;
      for (const name of names) {
        if (!env[name]) issue(name, `${name} is required when ${label}`);
      }
    };
    requireAll(env.VIDEO_PROVIDER === "mux", "VIDEO_PROVIDER=mux", [
      "MUX_TOKEN_ID",
      "MUX_TOKEN_SECRET",
      "MUX_SIGNING_KEY_ID",
      "MUX_SIGNING_KEY_PRIVATE",
      "MUX_WEBHOOK_SECRET",
    ]);
    requireAll(env.VIDEO_PROVIDER === "cloudflare_stream", "VIDEO_PROVIDER=cloudflare_stream", [
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_STREAM_API_TOKEN",
      "CLOUDFLARE_STREAM_CUSTOMER_CODE",
      "CLOUDFLARE_STREAM_SIGNING_KEY_ID",
      "CLOUDFLARE_STREAM_SIGNING_KEY_PEM",
      "CLOUDFLARE_STREAM_WEBHOOK_SECRET",
    ]);
    requireAll(env.STORAGE_PROVIDER === "s3", "STORAGE_PROVIDER=s3", [
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
    ]);
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
      if (env.VIDEO_PROVIDER === "local") {
        issue("VIDEO_PROVIDER", "local serves raw files from disk; use mux or cloudflare_stream");
      }
      if (env.STORAGE_PROVIDER === "local") {
        issue("STORAGE_PROVIDER", "local writes files to the server's disk; use s3");
      }
      if (
        env.ORDERS_INTEGRATION_TOKEN &&
        env.ORDERS_INTEGRATION_TOKEN === env.DELIVERY_WEBHOOK_TOKEN
      ) {
        issue("DELIVERY_WEBHOOK_TOKEN", "must differ from ORDERS_INTEGRATION_TOKEN");
      }
      const keys = [env.AUTH_SECRET, env.ACTIVATION_CODE_PEPPER, env.DATA_ENCRYPTION_KEY];
      if (new Set(keys).size !== keys.length) {
        issue(
          "AUTH_SECRET",
          "AUTH_SECRET, ACTIVATION_CODE_PEPPER and DATA_ENCRYPTION_KEY must differ",
        );
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
