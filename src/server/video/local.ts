import "server-only";
import { access, constants, mkdir } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../http/errors";
import { signUrlToken } from "../signed-token";
import type { LocalStorage } from "../storage/local";
import type { PlaybackSource, VideoProvider } from "./types";

export type LocalVideoToken = { key: string; viewerId: string; mimeType: string };

export function localVideoKey(assetId: string): string {
  return `videos/${assetId}`;
}

/**
 * Development / test provider: files on local disk, progressive playback
 * through an expiring, viewer-bound URL served by our API. No transcoding, no
 * adaptive bitrate — refused in staging/production by configuration validation.
 */
export class LocalVideoProvider implements VideoProvider {
  readonly name = "local";

  constructor(private readonly storage: LocalStorage) {}

  async createUpload(params: { assetId: string; sizeBytes: number; contentType: string }) {
    const key = localVideoKey(params.assetId);
    const target = await this.storage.createUpload({
      key,
      contentType: params.contentType,
      sizeBytes: params.sizeBytes,
    });
    return {
      target: { protocol: "put" as const, url: target.url, headers: target.headers },
      providerAssetId: key,
    };
  }

  async playback(params: {
    playbackId: string;
    viewerId: string;
    ttlSeconds: number;
    mimeType?: string | null;
  }): Promise<PlaybackSource> {
    const mimeType = params.mimeType ?? "video/mp4";
    const token = signUrlToken<LocalVideoToken>(
      "local-video",
      { key: params.playbackId, viewerId: params.viewerId, mimeType },
      params.ttlSeconds,
    );
    return {
      type: "file",
      src: `/api/v1/media/local-video/${token}`,
      mimeType,
      expiresAt: new Date(Date.now() + params.ttlSeconds * 1000).toISOString(),
    };
  }

  parseWebhook(): never {
    throw new AppError("NOT_FOUND");
  }

  async fetchAsset() {
    return null;
  }

  async protectAsset(): Promise<void> {}

  async deleteAsset(providerAssetId: string): Promise<void> {
    await this.storage.delete(providerAssetId);
  }

  async checkConnection() {
    const directory = path.dirname(this.storage.resolve(localVideoKey("probe")));
    try {
      await mkdir(directory, { recursive: true });
      await access(directory, constants.W_OK);
      return { ok: true, detail: "Local development storage" };
    } catch (error) {
      return { ok: false, detail: String(error) };
    }
  }
}
