/**
 * Content-Security-Policy additions for the configured media providers only
 * (least privilege: nothing is allowed for a provider that is not in use).
 * Pure module so the proxy can use it without importing server-only code.
 */

/** Reads VIDEO_PROVIDER, STORAGE_PROVIDER and S3_* (pass `process.env`). */
export type MediaCspEnv = Readonly<Record<string, string | undefined>>;

/** Origin browsers upload S3 objects to (mirrors S3Storage.objectUrl). */
export function s3UploadOrigin(env: MediaCspEnv): string | null {
  if (!env.S3_BUCKET) return null;
  const pathStyle = env.S3_FORCE_PATH_STYLE === "true" || env.S3_FORCE_PATH_STYLE === "1";
  const region = env.S3_REGION || "us-east-1";
  try {
    if (!env.S3_ENDPOINT) {
      return pathStyle
        ? `https://s3.${region}.amazonaws.com`
        : `https://${env.S3_BUCKET}.s3.${region}.amazonaws.com`;
    }
    const base = new URL(env.S3_ENDPOINT);
    return pathStyle ? base.origin : `${base.protocol}//${env.S3_BUCKET}.${base.host}`;
  } catch {
    return null;
  }
}

export function mediaCspSources(env: MediaCspEnv): {
  connect: string[];
  media: string[];
  img: string[];
} {
  const connect: string[] = [];
  const media: string[] = [];
  const img: string[] = [];
  if (env.VIDEO_PROVIDER === "mux") {
    // HLS manifests/segments (stream.mux.com + edge hosts), thumbnails, direct uploads.
    connect.push("https://*.mux.com", "https://storage.googleapis.com");
    media.push("https://*.mux.com");
    img.push("https://image.mux.com");
  } else if (env.VIDEO_PROVIDER === "cloudflare_stream") {
    connect.push(
      "https://*.cloudflarestream.com",
      "https://*.videodelivery.net",
      "https://upload.videodelivery.net",
    );
    media.push("https://*.cloudflarestream.com", "https://*.videodelivery.net");
    img.push("https://*.cloudflarestream.com", "https://*.videodelivery.net");
  }
  if (env.STORAGE_PROVIDER === "s3") {
    const origin = s3UploadOrigin(env);
    if (origin) connect.push(origin);
  }
  return { connect, media, img };
}
