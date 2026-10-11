import { AwsClient } from "aws4fetch";
import { beforeAll, describe, expect, it } from "vitest";
import { S3Storage } from "@/server/storage/s3";

/**
 * Real S3-protocol round trip. Runs only when an S3-compatible server is
 * provided, e.g. a local MinIO:
 *
 *   minio server /tmp/minio-data --address 127.0.0.1:9100
 *   S3_TEST_ENDPOINT=http://127.0.0.1:9100 S3_TEST_ACCESS_KEY_ID=… \
 *   S3_TEST_SECRET_ACCESS_KEY=… npm run test:integration -- storage-s3
 *
 * MinIO verifies SigV4 strictly, so this proves the presigned URLs (including
 * the signed Content-Type and Content-Length) are accepted — and that tampered
 * uploads are refused.
 */
const endpoint = process.env.S3_TEST_ENDPOINT;
const accessKeyId = process.env.S3_TEST_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.S3_TEST_SECRET_ACCESS_KEY ?? "";
const bucket = process.env.S3_TEST_BUCKET ?? "academy-test";
const region = process.env.S3_TEST_REGION ?? "us-east-1";

describe.skipIf(!endpoint)("S3 storage against a real S3-compatible server", () => {
  const storage = new S3Storage({
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: true,
  });
  const body = new TextEncoder().encode("الدرس الأول — worksheet v1");

  beforeAll(async () => {
    const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region });
    const response = await client.fetch(`${endpoint}/${bucket}`, { method: "PUT" });
    // 200 created, 409 already owned by us.
    expect([200, 409]).toContain(response.status);
  });

  it("uploads with a presigned PUT and downloads with a presigned GET", async () => {
    const key = `files/test-${Date.now()}`;
    const upload = await storage.createUpload({
      key,
      contentType: "application/pdf",
      sizeBytes: body.byteLength,
    });
    const put = await fetch(upload.url, { method: "PUT", body, headers: upload.headers });
    expect(put.status).toBe(200);

    expect(await storage.head(key)).toEqual({
      sizeBytes: body.byteLength,
      contentType: "application/pdf",
    });

    const download = await storage.createDownloadUrl({
      key,
      filename: "ورقة العمل.pdf",
      contentType: "application/pdf",
    });
    const get = await fetch(download);
    expect(get.status).toBe(200);
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(body);
    expect(get.headers.get("content-disposition")).toContain("filename*=UTF-8''");

    await storage.delete(key);
    expect(await storage.head(key)).toBeNull();
  });

  it("refuses uploads whose size or type differ from what was authorised", async () => {
    const key = `files/tamper-${Date.now()}`;
    const upload = await storage.createUpload({
      key,
      contentType: "application/pdf",
      sizeBytes: 4,
    });
    const tooBig = await fetch(upload.url, { method: "PUT", body, headers: upload.headers });
    expect(tooBig.status).toBe(403);

    const exact = await storage.createUpload({
      key,
      contentType: "application/pdf",
      sizeBytes: body.byteLength,
    });
    const otherType = await fetch(exact.url, {
      method: "PUT",
      body,
      headers: { "Content-Type": "text/html" },
    });
    expect(otherType.status).toBe(403);
    expect(await storage.head(key)).toBeNull();
  });

  it("refuses URLs signed with another secret and expired URLs", async () => {
    const forged = new S3Storage({
      endpoint,
      region,
      bucket,
      accessKeyId,
      secretAccessKey: `${secretAccessKey}x`,
      forcePathStyle: true,
    });
    const key = `files/forged-${Date.now()}`;
    const upload = await forged.createUpload({
      key,
      contentType: "application/pdf",
      sizeBytes: body.byteLength,
    });
    const put = await fetch(upload.url, { method: "PUT", body, headers: upload.headers });
    expect(put.status).toBe(403);

    const expiring = await storage.createUpload({
      key,
      contentType: "application/pdf",
      sizeBytes: body.byteLength,
      ttlSeconds: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    const late = await fetch(expiring.url, { method: "PUT", body, headers: expiring.headers });
    expect(late.status).toBe(403);
  });
});
