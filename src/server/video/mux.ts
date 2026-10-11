import "server-only";
import type { KeyObject } from "node:crypto";
import { AppError } from "../http/errors";
import { loadPrivateKey, signRs256Jwt } from "./jwt";
import type { PlaybackSource, VideoAssetUpdate, VideoProvider, VideoWebhookEvent } from "./types";
import { verifyTimestampedSignature } from "./webhook-signature";

export type MuxConfig = {
  tokenId: string;
  tokenSecret: string;
  signingKeyId: string;
  signingKeyPrivate: string;
  webhookSecret: string;
  /** Origin allowed to upload from the browser (APP_URL). */
  corsOrigin: string;
  videoQuality: "basic" | "plus" | "premium";
  playbackRestrictionId?: string;
  fetchImpl?: typeof fetch;
};

type MuxAsset = {
  id: string;
  status?: "preparing" | "ready" | "errored";
  passthrough?: string;
  duration?: number;
  playback_ids?: Array<{ id: string; policy: string }>;
  tracks?: Array<{ type: string; max_width?: number; max_height?: number }>;
  errors?: { type?: string; messages?: string[] };
};

const API = "https://api.mux.com";

/** Normalises a Mux asset. Only a *signed* playback id is ever used. */
export function mapMuxAsset(asset: MuxAsset): VideoAssetUpdate {
  const signedPlayback = asset.playback_ids?.find((playback) => playback.policy === "signed");
  const video = asset.tracks?.find((track) => track.type === "video");
  const base: VideoAssetUpdate = {
    status: "processing",
    providerAssetId: asset.id,
    durationSeconds: typeof asset.duration === "number" ? Math.round(asset.duration) : undefined,
    width: video?.max_width,
    height: video?.max_height,
  };
  if (asset.status === "errored") {
    return {
      ...base,
      status: "failed",
      failureReason: asset.errors?.messages?.join("; ") || asset.errors?.type || "errored",
    };
  }
  if (asset.status === "ready") {
    if (!signedPlayback) {
      return { ...base, status: "failed", failureReason: "Asset has no signed playback id" };
    }
    return { ...base, status: "ready", playbackId: signedPlayback.id };
  }
  return base;
}

/**
 * Mux Video: browser → Mux direct upload (no bytes through our servers),
 * signed playback policy only, RS256 playback tokens, HMAC-signed webhooks.
 */
export class MuxProvider implements VideoProvider {
  readonly name = "mux";
  private readonly key: KeyObject;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: MuxConfig) {
    this.key = loadPrivateKey(config.signingKeyPrivate);
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const response = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.tokenId}:${this.config.tokenSecret}`).toString("base64")}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Mux API ${method} ${path} responded ${response.status}`);
    if (response.status === 204) return null;
    return ((await response.json()) as { data: T }).data;
  }

  async createUpload(params: { assetId: string }) {
    const upload = await this.request<{ id: string; url: string }>("POST", "/video/v1/uploads", {
      cors_origin: this.config.corsOrigin,
      // One-week window to start the upload (resumable chunks, large files).
      timeout: 604_800,
      new_asset_settings: {
        playback_policy: ["signed"],
        passthrough: params.assetId,
        video_quality: this.config.videoQuality,
      },
    });
    if (!upload) throw new Error("Mux did not return an upload");
    return {
      target: { protocol: "mux-upchunk" as const, url: upload.url },
      providerUploadId: upload.id,
    };
  }

  signToken(playbackId: string, audience: "v" | "t", expiresAt: number): string {
    return signRs256Jwt(
      {
        sub: playbackId,
        aud: audience,
        exp: expiresAt,
        kid: this.config.signingKeyId,
        ...(this.config.playbackRestrictionId
          ? { playback_restriction_id: this.config.playbackRestrictionId }
          : {}),
      },
      this.key,
      this.config.signingKeyId,
    );
  }

  async playback(params: { playbackId: string; ttlSeconds: number }): Promise<PlaybackSource> {
    const exp = Math.floor(Date.now() / 1000) + params.ttlSeconds;
    const id = encodeURIComponent(params.playbackId);
    return {
      type: "hls",
      src: `https://stream.mux.com/${id}.m3u8?token=${this.signToken(params.playbackId, "v", exp)}`,
      posterUrl: `https://image.mux.com/${id}/thumbnail.webp?token=${this.signToken(params.playbackId, "t", exp)}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  parseWebhook(rawBody: string, headers: Headers): VideoWebhookEvent {
    const valid = verifyTimestampedSignature({
      header: headers.get("mux-signature"),
      rawBody,
      secret: this.config.webhookSecret,
      timestampKey: "t",
      signatureKey: "v1",
    });
    if (!valid) throw new AppError("WEBHOOK_SIGNATURE_INVALID");
    const event = JSON.parse(rawBody) as {
      id?: string;
      type: string;
      data: MuxAsset & {
        asset_id?: string;
        new_asset_settings?: { passthrough?: string };
        error?: { message?: string };
      };
    };
    const { type, data } = event;
    switch (type) {
      case "video.asset.created":
      case "video.asset.ready":
      case "video.asset.errored":
        return {
          kind: "asset",
          type,
          eventId: event.id,
          match: { assetId: data.passthrough, providerAssetId: data.id },
          update: mapMuxAsset(data),
        };
      case "video.asset.deleted":
        return {
          kind: "asset",
          type,
          eventId: event.id,
          match: { assetId: data.passthrough, providerAssetId: data.id },
          update: { status: "deleted", providerAssetId: data.id },
        };
      case "video.upload.asset_created":
        return {
          kind: "asset",
          type,
          eventId: event.id,
          match: { assetId: data.new_asset_settings?.passthrough },
          update: { status: "processing", providerAssetId: data.asset_id },
        };
      case "video.upload.errored":
      case "video.upload.cancelled":
        return {
          kind: "asset",
          type,
          eventId: event.id,
          match: { assetId: data.new_asset_settings?.passthrough },
          update: { status: "failed", failureReason: data.error?.message ?? type },
        };
      default:
        return { kind: "ignored", type };
    }
  }

  async fetchAsset(params: { providerAssetId?: string; providerUploadId?: string }) {
    let assetId = params.providerAssetId;
    if (!assetId && params.providerUploadId) {
      const upload = await this.request<{ asset_id?: string; status?: string }>(
        "GET",
        `/video/v1/uploads/${encodeURIComponent(params.providerUploadId)}`,
      );
      if (!upload) return null;
      if (
        upload.status === "errored" ||
        upload.status === "cancelled" ||
        upload.status === "timed_out"
      ) {
        return { status: "failed" as const, failureReason: `Upload ${upload.status}` };
      }
      assetId = upload.asset_id;
    }
    if (!assetId) return null;
    const asset = await this.request<MuxAsset>(
      "GET",
      `/video/v1/assets/${encodeURIComponent(assetId)}`,
    );
    return asset ? mapMuxAsset(asset) : null;
  }

  async protectAsset(): Promise<void> {
    // Uploads are created with the "signed" playback policy only; mapMuxAsset
    // refuses assets without a signed playback id.
  }

  async deleteAsset(providerAssetId: string): Promise<void> {
    await this.request("DELETE", `/video/v1/assets/${encodeURIComponent(providerAssetId)}`);
  }

  async checkConnection() {
    try {
      await this.request("GET", "/video/v1/assets?limit=1");
      return { ok: true };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}
