import "server-only";
import { AwsClient, AwsV4Signer } from "aws4fetch";
import { contentDisposition } from "../http/content-disposition";
import { OBJECT_KEY_PATTERN, type ObjectStorage, type StoredObjectInfo } from "./types";

/**
 * SigV4 query-string presigning (AWS "Authenticating Requests: Using Query
 * Parameters"). Every header passed is signed — including Content-Type and
 * Content-Length for uploads, so the bucket rejects a different type or size.
 */
export async function presignS3Url(params: {
  method: "GET" | "PUT";
  url: URL;
  headers: Record<string, string>;
  ttlSeconds: number;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Fixed timestamp (YYYYMMDDTHHMMSSZ) for reproducible tests. */
  datetime?: string;
}): Promise<string> {
  const url = new URL(params.url);
  url.searchParams.set("X-Amz-Expires", String(params.ttlSeconds));
  const signer = new AwsV4Signer({
    method: params.method,
    url: url.toString(),
    headers: params.headers,
    accessKeyId: params.accessKeyId,
    secretAccessKey: params.secretAccessKey,
    service: "s3",
    region: params.region,
    signQuery: true,
    allHeaders: true,
    datetime: params.datetime,
  });
  const signed = await signer.sign();
  return signed.url.toString();
}

export type S3Config = {
  /** Omit for AWS S3. R2: https://<account>.r2.cloudflarestorage.com; Supabase: https://<ref>.supabase.co/storage/v1/s3 */
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Path-style URLs (required by MinIO and Supabase Storage). */
  forcePathStyle: boolean;
};

/**
 * Any S3-compatible object store, using SigV4 presigned URLs so file bytes go
 * straight between the browser and the bucket (never through the app server).
 * The bucket stays private; its CORS policy must allow PUT from APP_URL.
 */
export class S3Storage implements ObjectStorage {
  readonly name = "s3";
  private readonly client: AwsClient;

  constructor(private readonly config: S3Config) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: config.region,
      retries: 2,
    });
  }

  /** Bucket root: virtual-hosted (bucket.host/) or path-style (host/bucket). */
  bucketUrl(): URL {
    const { endpoint, bucket, region, forcePathStyle } = this.config;
    if (!endpoint) {
      return forcePathStyle
        ? new URL(`https://s3.${region}.amazonaws.com/${bucket}`)
        : new URL(`https://${bucket}.s3.${region}.amazonaws.com/`);
    }
    const base = new URL(endpoint);
    const basePath = base.pathname.replace(/\/+$/, "");
    return forcePathStyle
      ? new URL(`${base.origin}${basePath}/${bucket}`)
      : new URL(`${base.protocol}//${bucket}.${base.host}${basePath}/`);
  }

  objectUrl(key: string): URL {
    if (!OBJECT_KEY_PATTERN.test(key) || key.includes("..")) {
      throw new Error("Invalid object key");
    }
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    const bucket = this.bucketUrl();
    const prefix = bucket.pathname.endsWith("/") ? bucket.pathname : `${bucket.pathname}/`;
    return new URL(`${bucket.origin}${prefix}${encodedKey}`);
  }

  /** Origin the browser uploads to (for the Content-Security-Policy connect-src). */
  uploadOrigin(): string {
    return this.objectUrl("probe").origin;
  }

  private presign(
    method: "GET" | "PUT",
    url: URL,
    headers: Record<string, string>,
    ttlSeconds: number,
  ): Promise<string> {
    return presignS3Url({
      method,
      url,
      headers,
      ttlSeconds,
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
    });
  }

  async createUpload(params: {
    key: string;
    contentType: string;
    sizeBytes: number;
    ttlSeconds?: number;
  }) {
    const ttlSeconds = params.ttlSeconds ?? 900;
    const url = await this.presign(
      "PUT",
      this.objectUrl(params.key),
      { "content-type": params.contentType, "content-length": String(params.sizeBytes) },
      ttlSeconds,
    );
    return {
      method: "PUT" as const,
      url,
      // Content-Length is set by the browser from the file itself.
      headers: { "Content-Type": params.contentType },
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
  }

  async createDownloadUrl(params: {
    key: string;
    filename: string;
    contentType: string;
    ttlSeconds?: number;
  }) {
    const url = this.objectUrl(params.key);
    url.searchParams.set("response-content-disposition", contentDisposition(params.filename));
    url.searchParams.set("response-content-type", params.contentType);
    return this.presign("GET", url, {}, params.ttlSeconds ?? 300);
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    const response = await this.client.fetch(this.objectUrl(key).toString(), {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404 || response.status === 403) return null;
    if (!response.ok) throw new Error(`S3 HEAD responded ${response.status}`);
    return {
      sizeBytes: Number(response.headers.get("content-length") ?? "0"),
      contentType: response.headers.get("content-type"),
    };
  }

  async checkConnection() {
    try {
      const response = await this.client.fetch(this.bucketUrl().toString(), {
        method: "HEAD",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return { ok: true };
      const detail =
        response.status === 404
          ? "Bucket not found"
          : response.status === 403
            ? "Access denied (check the keys and the bucket policy)"
            : `HEAD bucket responded ${response.status}`;
      return { ok: false, detail };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async delete(key: string): Promise<void> {
    const response = await this.client.fetch(this.objectUrl(key).toString(), {
      method: "DELETE",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 DELETE responded ${response.status}`);
    }
  }
}
