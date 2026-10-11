import type { MediaStatus } from "@/shared/enums";

export type VideoProviderName = "local" | "mux" | "cloudflare_stream";

/** How the admin's browser sends the file. */
export type VideoUploadTarget =
  /** Mux direct upload URL (resumable, chunked with @mux/upchunk). */
  | { protocol: "mux-upchunk"; url: string }
  /** Cloudflare Stream one-time tus URL (resumable, tus-js-client). */
  | { protocol: "tus"; url: string }
  /** Single PUT to our own API (local development provider). */
  | { protocol: "put"; url: string; headers: Record<string, string> };

/** What the student's player receives: short-lived, bound to one viewer. */
export type PlaybackSource = {
  type: "hls" | "file";
  src: string;
  mimeType?: string;
  posterUrl?: string;
  expiresAt: string;
};

export type VideoAssetUpdate = {
  status: Extract<MediaStatus, "processing" | "ready" | "failed" | "deleted">;
  providerAssetId?: string;
  playbackId?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  failureReason?: string;
  /** The provider would serve this asset without a signed token: call protectAsset(). */
  requiresProtection?: boolean;
};

export type VideoWebhookEvent =
  | { kind: "ignored"; type: string }
  | {
      kind: "asset";
      type: string;
      eventId?: string;
      /** Our media_assets.id (passthrough / name) and/or the provider's identifiers. */
      match: { assetId?: string; providerAssetId?: string };
      update: VideoAssetUpdate;
    };

export interface VideoProvider {
  readonly name: VideoProviderName;
  createUpload(params: {
    assetId: string;
    sizeBytes: number;
    contentType: string;
    maxDurationSeconds: number;
  }): Promise<{ target: VideoUploadTarget; providerAssetId?: string; providerUploadId?: string }>;
  /** Signs a playback source for one viewer. Callers must check entitlement first. */
  playback(params: {
    playbackId: string;
    viewerId: string;
    ttlSeconds: number;
    mimeType?: string | null;
  }): Promise<PlaybackSource>;
  /** Verifies the signature and normalises the event. Throws WEBHOOK_SIGNATURE_INVALID. */
  parseWebhook(rawBody: string, headers: Headers): VideoWebhookEvent;
  /** Reconciles an asset with the provider (when a webhook was missed or delayed). */
  fetchAsset(params: {
    providerAssetId?: string;
    providerUploadId?: string;
  }): Promise<VideoAssetUpdate | null>;
  /** Ensures the asset can only be played with signed tokens. */
  protectAsset(providerAssetId: string): Promise<void>;
  deleteAsset(providerAssetId: string): Promise<void>;
  /** Cheap authenticated call used by the admin "test connection" button. */
  checkConnection(): Promise<{ ok: boolean; detail?: string }>;
}
