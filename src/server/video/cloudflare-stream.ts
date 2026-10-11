import "server-only";
import type { KeyObject } from "node:crypto";
import { AppError } from "../http/errors";
import { loadPrivateKey, signRs256Jwt } from "./jwt";
import type { PlaybackSource, VideoAssetUpdate, VideoProvider, VideoWebhookEvent } from "./types";
import { verifyTimestampedSignature } from "./webhook-signature";

export type CloudflareStreamConfig = {
  accountId: string;
  apiToken: string;
  customerCode: string;
  signingKeyId: string;
  signingKeyPem: string;
  webhookSecret: string;
  /** Hostname allowed to play videos (omitted for localhost). */
  allowedOrigin?: string;
  fetchImpl?: typeof fetch;
};

type StreamVideo = {
  uid: string;
  readyToStream?: boolean;
  requireSignedURLs?: boolean;
  duration?: number;
  input?: { width?: number; height?: number };
  meta?: { name?: string };
  status?: { state?: string; errorReasonCode?: string; errorReasonText?: string };
};

/** Normalises a Stream video; flags videos that would be playable without a signed token. */
export function mapCloudflareVideo(video: StreamVideo): VideoAssetUpdate {
  const state = video.status?.state;
  const base: VideoAssetUpdate = {
    status: "processing",
    providerAssetId: video.uid,
    durationSeconds:
      typeof video.duration === "number" && video.duration > 0
        ? Math.round(video.duration)
        : undefined,
    width: video.input?.width && video.input.width > 0 ? video.input.width : undefined,
    height: video.input?.height && video.input.height > 0 ? video.input.height : undefined,
  };
  if (state === "error") {
    return {
      ...base,
      status: "failed",
      failureReason: video.status?.errorReasonText || video.status?.errorReasonCode || "error",
    };
  }
  if (video.readyToStream && state === "ready") {
    return {
      ...base,
      status: "ready",
      playbackId: video.uid,
      requiresProtection: video.requireSignedURLs !== true,
    };
  }
  return base;
}

const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64");

/**
 * Cloudflare Stream: resumable tus direct creator uploads, signed URLs
 * (requireSignedURLs + RS256 tokens from a Stream signing key), signed webhooks.
 */
export class CloudflareStreamProvider implements VideoProvider {
  readonly name = "cloudflare_stream";
  private readonly key: KeyObject;
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;

  constructor(private readonly config: CloudflareStreamConfig) {
    this.key = loadPrivateKey(config.signingKeyPem);
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/stream`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const response = await this.fetchImpl(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Cloudflare Stream ${method} ${path || "/"} responded ${response.status}`);
    }
    const text = await response.text();
    if (!text) return null;
    return (JSON.parse(text) as { result: T }).result;
  }

  async createUpload(params: { assetId: string; sizeBytes: number; maxDurationSeconds: number }) {
    const metadata = [
      `name ${b64(params.assetId)}`,
      "requiresignedurls",
      `maxdurationseconds ${b64(String(params.maxDurationSeconds))}`,
      ...(this.config.allowedOrigin ? [`allowedorigins ${b64(this.config.allowedOrigin)}`] : []),
    ].join(",");
    const response = await this.fetchImpl(`${this.base}?direct_user=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(params.sizeBytes),
        "Upload-Metadata": metadata,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const location = response.headers.get("location");
    const uid = response.headers.get("stream-media-id");
    if (!response.ok || !location || !uid) {
      throw new Error(`Cloudflare Stream tus creation responded ${response.status}`);
    }
    return { target: { protocol: "tus" as const, url: location }, providerAssetId: uid };
  }

  signToken(uid: string, expiresAt: number): string {
    return signRs256Jwt(
      { sub: uid, kid: this.config.signingKeyId, exp: expiresAt },
      this.key,
      this.config.signingKeyId,
    );
  }

  async playback(params: { playbackId: string; ttlSeconds: number }): Promise<PlaybackSource> {
    const exp = Math.floor(Date.now() / 1000) + params.ttlSeconds;
    const token = this.signToken(params.playbackId, exp);
    const host = `https://customer-${this.config.customerCode}.cloudflarestream.com`;
    return {
      type: "hls",
      src: `${host}/${token}/manifest/video.m3u8`,
      posterUrl: `${host}/${token}/thumbnails/thumbnail.jpg`,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  parseWebhook(rawBody: string, headers: Headers): VideoWebhookEvent {
    const valid = verifyTimestampedSignature({
      header: headers.get("webhook-signature"),
      rawBody,
      secret: this.config.webhookSecret,
      timestampKey: "time",
      signatureKey: "sig1",
    });
    if (!valid) throw new AppError("WEBHOOK_SIGNATURE_INVALID");
    const video = JSON.parse(rawBody) as StreamVideo;
    if (!video.uid) return { kind: "ignored", type: "unknown" };
    return {
      kind: "asset",
      type: `stream.${video.status?.state ?? "unknown"}`,
      match: { providerAssetId: video.uid, assetId: video.meta?.name },
      update: mapCloudflareVideo(video),
    };
  }

  async fetchAsset(params: { providerAssetId?: string }) {
    if (!params.providerAssetId) return null;
    const video = await this.request<StreamVideo>(
      "GET",
      `/${encodeURIComponent(params.providerAssetId)}`,
    );
    return video ? mapCloudflareVideo(video) : null;
  }

  async protectAsset(providerAssetId: string): Promise<void> {
    await this.request("POST", `/${encodeURIComponent(providerAssetId)}`, {
      uid: providerAssetId,
      requireSignedURLs: true,
    });
  }

  async deleteAsset(providerAssetId: string): Promise<void> {
    await this.request("DELETE", `/${encodeURIComponent(providerAssetId)}`);
  }

  async checkConnection() {
    try {
      const keys = await this.request<Array<{ id: string }>>("GET", "/keys");
      const found = keys?.some((key) => key.id === this.config.signingKeyId) ?? false;
      return found
        ? { ok: true }
        : { ok: false, detail: "Signing key id not found in this Stream account" };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}
