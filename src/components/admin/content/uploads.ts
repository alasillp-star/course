"use client";

/**
 * Browser-side uploads straight to the storage / video provider. The app
 * server only authorises and records; file bytes never pass through it
 * (except the local development providers, which use our own API).
 */

export type VideoUploadTarget =
  | { protocol: "put"; url: string; headers: Record<string, string> }
  | { protocol: "mux-upchunk"; url: string }
  | { protocol: "tus"; url: string };

type Progress = (percent: number) => void;

/** Single PUT with upload progress (presigned S3 URL or the local dev endpoint). */
export function putWithProgress(
  url: string,
  file: Blob,
  headers: Record<string, string>,
  onProgress: Progress,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded * 100) / event.total));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/** Uploads a video to its provider with the protocol the server chose. */
export async function uploadVideo(
  target: VideoUploadTarget,
  file: File,
  onProgress: Progress,
  signal: AbortSignal,
): Promise<void> {
  if (target.protocol === "put") {
    return putWithProgress(target.url, file, target.headers, onProgress, signal);
  }
  if (target.protocol === "mux-upchunk") {
    const { createUpload } = await import("@mux/upchunk");
    // Resumable, chunked PUTs (30 MB chunks) to Mux's direct-upload URL.
    const upload = createUpload({ endpoint: target.url, file, chunkSize: 30_720 });
    return new Promise((resolve, reject) => {
      upload.on("progress", (event) => onProgress(Math.round(Number(event.detail))));
      upload.on("success", () => resolve());
      upload.on("error", (event) =>
        reject(
          new Error(String((event.detail as { message?: string })?.message ?? "Upload failed")),
        ),
      );
      signal.addEventListener(
        "abort",
        () => {
          upload.abort();
          reject(new DOMException("Upload cancelled", "AbortError"));
        },
        { once: true },
      );
    });
  }
  const tus = await import("tus-js-client");
  // Cloudflare Stream one-time tus URL: resume against it directly (50 MB chunks).
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      uploadUrl: target.url,
      chunkSize: 50 * 1024 * 1024,
      retryDelays: [0, 3000, 10_000, 30_000],
      onProgress: (sent, total) => onProgress(Math.round((sent * 100) / total)),
      onSuccess: () => resolve(),
      onError: (error) => reject(error),
    });
    signal.addEventListener(
      "abort",
      () => {
        void upload.abort(false);
        reject(new DOMException("Upload cancelled", "AbortError"));
      },
      { once: true },
    );
    upload.start();
  });
}

/** Reads a video's duration in the browser (fallback when the server cannot probe it). */
export function probeVideoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const finish = (value?: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      finish(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined);
    video.onerror = () => finish(undefined);
    setTimeout(() => finish(undefined), 8000);
    video.src = url;
  });
}
