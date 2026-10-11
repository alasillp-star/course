import "server-only";
import { getEnv } from "../env";
import { AppError } from "../http/errors";
import { LocalStorage } from "../storage/local";
import { CloudflareStreamProvider } from "./cloudflare-stream";
import { LocalVideoProvider } from "./local";
import { MuxProvider } from "./mux";
import type { VideoProvider } from "./types";

export type {
  PlaybackSource,
  VideoAssetUpdate,
  VideoProvider,
  VideoProviderName,
  VideoUploadTarget,
  VideoWebhookEvent,
} from "./types";

let instance: VideoProvider | null | undefined;

function isLocalHost(url: string): boolean {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/** The configured video provider, or null when VIDEO_PROVIDER=none. */
export function getVideoProvider(): VideoProvider | null {
  if (instance !== undefined) return instance;
  const env = getEnv();
  switch (env.VIDEO_PROVIDER) {
    case "local":
      instance = new LocalVideoProvider(new LocalStorage(env.LOCAL_STORAGE_DIR));
      break;
    case "mux":
      instance = new MuxProvider({
        tokenId: env.MUX_TOKEN_ID!,
        tokenSecret: env.MUX_TOKEN_SECRET!,
        signingKeyId: env.MUX_SIGNING_KEY_ID!,
        signingKeyPrivate: env.MUX_SIGNING_KEY_PRIVATE!,
        webhookSecret: env.MUX_WEBHOOK_SECRET!,
        corsOrigin: env.APP_URL,
        videoQuality: env.MUX_VIDEO_QUALITY,
        playbackRestrictionId: env.MUX_PLAYBACK_RESTRICTION_ID,
      });
      break;
    case "cloudflare_stream":
      instance = new CloudflareStreamProvider({
        accountId: env.CLOUDFLARE_ACCOUNT_ID!,
        apiToken: env.CLOUDFLARE_STREAM_API_TOKEN!,
        customerCode: env.CLOUDFLARE_STREAM_CUSTOMER_CODE!,
        signingKeyId: env.CLOUDFLARE_STREAM_SIGNING_KEY_ID!,
        signingKeyPem: env.CLOUDFLARE_STREAM_SIGNING_KEY_PEM!,
        webhookSecret: env.CLOUDFLARE_STREAM_WEBHOOK_SECRET!,
        allowedOrigin: isLocalHost(env.APP_URL) ? undefined : new URL(env.APP_URL).hostname,
      });
      break;
    default:
      instance = null;
  }
  return instance;
}

export function requireVideoProvider(): VideoProvider {
  const provider = getVideoProvider();
  if (!provider) throw new AppError("PROVIDER_NOT_CONFIGURED", "No video provider configured");
  return provider;
}

/** Test hook: replace (or reset with undefined) the provider instance. */
export function setVideoProvider(next: VideoProvider | null | undefined): void {
  instance = next;
}
