import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError } from "../http/errors";
import { signUrlToken } from "../signed-token";
import { OBJECT_KEY_PATTERN, type ObjectStorage, type StoredObjectInfo } from "./types";

type Sidecar = { contentType: string; sizeBytes: number };

export type LocalFileToken = {
  key: string;
  filename: string;
  contentType: string;
  viewerId: string | null;
};

/**
 * Development / test storage on the local disk. Refused in staging and
 * production by configuration validation: files on an app server's disk are
 * neither durable nor shared between instances.
 */
export class LocalStorage implements ObjectStorage {
  readonly name = "local";
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  /** Absolute path for a key, guaranteed to stay inside the storage root. */
  resolve(key: string): string {
    if (!OBJECT_KEY_PATTERN.test(key) || key.includes("..")) {
      throw new AppError("INVALID_REQUEST", "Invalid object key");
    }
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) {
      throw new AppError("INVALID_REQUEST", "Invalid object key");
    }
    return full;
  }

  async createUpload(params: {
    key: string;
    contentType: string;
    sizeBytes: number;
    ttlSeconds?: number;
  }) {
    this.resolve(params.key);
    const ttlSeconds = params.ttlSeconds ?? 3600;
    // Like a presigned S3 PUT: the token pins key, type and exact size. The
    // route additionally requires a staff session with media.manage.
    const token = signUrlToken(
      "local-upload",
      { key: params.key, contentType: params.contentType, sizeBytes: params.sizeBytes },
      ttlSeconds,
    );
    return {
      method: "PUT" as const,
      url: `/api/v1/admin/media/local-upload/${token}`,
      headers: { "Content-Type": params.contentType },
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
  }

  async createDownloadUrl(params: {
    key: string;
    filename: string;
    contentType: string;
    ttlSeconds?: number;
    viewerId?: string;
  }) {
    this.resolve(params.key);
    const token = signUrlToken<LocalFileToken>(
      "local-file",
      {
        key: params.key,
        filename: params.filename,
        contentType: params.contentType,
        viewerId: params.viewerId ?? null,
      },
      params.ttlSeconds ?? 300,
    );
    return `/api/v1/files/${token}`;
  }

  /**
   * Streams a request body to disk, enforcing the exact declared size.
   * Written to a temporary file first so readers never see partial objects.
   */
  async writeObject(
    key: string,
    body: ReadableStream<Uint8Array>,
    params: { contentType: string; expectedBytes: number },
  ): Promise<StoredObjectInfo> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.upload-${process.pid}-${Date.now()}`;
    let written = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        written += chunk.length;
        if (written > params.expectedBytes) {
          callback(new AppError("UPLOAD_TOO_LARGE"));
          return;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(
        Readable.fromWeb(body as import("node:stream/web").ReadableStream),
        limiter,
        createWriteStream(temp, { mode: 0o600 }),
      );
      if (written !== params.expectedBytes) {
        throw new AppError("INVALID_REQUEST", "Upload size does not match the declared size");
      }
      await rename(temp, target);
      const sidecar: Sidecar = { contentType: params.contentType, sizeBytes: written };
      await writeFile(`${target}.meta.json`, JSON.stringify(sidecar), { mode: 0o600 });
      return { sizeBytes: written, contentType: params.contentType };
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  /** Opens an object for streaming, optionally a byte range (inclusive end). */
  async openObject(key: string, range?: { start: number; end: number }) {
    const file = this.resolve(key);
    const info = await this.head(key);
    if (!info) return null;
    const stream = createReadStream(file, range ? { start: range.start, end: range.end } : {});
    return { stream: Readable.toWeb(stream) as ReadableStream<Uint8Array>, info };
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    const file = this.resolve(key);
    try {
      const [stats, raw] = await Promise.all([
        stat(file),
        readFile(`${file}.meta.json`, "utf8").catch(() => null),
      ]);
      const sidecar = raw ? (JSON.parse(raw) as Partial<Sidecar>) : {};
      return { sizeBytes: stats.size, contentType: sidecar.contentType ?? null };
    } catch {
      return null;
    }
  }

  async checkConnection() {
    try {
      await mkdir(this.root, { recursive: true });
      return { ok: true, detail: "Local development storage" };
    } catch (error) {
      return { ok: false, detail: String(error) };
    }
  }

  async delete(key: string): Promise<void> {
    const file = this.resolve(key);
    await Promise.all([rm(file, { force: true }), rm(`${file}.meta.json`, { force: true })]);
  }
}
