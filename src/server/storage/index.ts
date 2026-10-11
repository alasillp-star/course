import "server-only";
import { getEnv } from "../env";
import { AppError } from "../http/errors";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";
import type { ObjectStorage } from "./types";

export type { ObjectStorage, StoredObjectInfo, UploadTarget } from "./types";
export { LocalStorage } from "./local";
export { S3Storage } from "./s3";

let instance: ObjectStorage | null | undefined;

/** The configured object storage, or null when STORAGE_PROVIDER=none. */
export function getStorage(): ObjectStorage | null {
  if (instance !== undefined) return instance;
  const env = getEnv();
  switch (env.STORAGE_PROVIDER) {
    case "local":
      instance = new LocalStorage(env.LOCAL_STORAGE_DIR);
      break;
    case "s3":
      instance = new S3Storage({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET!,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      });
      break;
    default:
      instance = null;
  }
  return instance;
}

export function requireStorage(): ObjectStorage {
  const storage = getStorage();
  if (!storage) throw new AppError("PROVIDER_NOT_CONFIGURED", "No file storage configured");
  return storage;
}

/** Test hook: replace (or reset with undefined) the storage instance. */
export function setStorage(next: ObjectStorage | null | undefined): void {
  instance = next;
}
