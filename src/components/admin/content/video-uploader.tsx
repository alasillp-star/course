"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2Icon, FilmIcon, Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { ApiActionDialog } from "@/components/admin/api-action-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { format } from "@/i18n/format";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { formatClock } from "@/lib/media-format";
import type { MediaStatus } from "@/shared/enums";
import { probeVideoDuration, uploadVideo, type VideoUploadTarget } from "./uploads";

type AssetStatus = { id: string; status: MediaStatus; failureReason: string | null };

const ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-m4v";

export function VideoUploader({
  lessonId,
  current,
  pending,
  providerConfigured,
  maxMb,
  canRemove,
  labels,
  common,
  errors,
}: {
  lessonId: string;
  current: { status: MediaStatus; durationSeconds: number | null; filename: string | null } | null;
  pending: AssetStatus | null;
  providerConfigured: boolean;
  maxMb: number;
  canRemove: boolean;
  labels: Dictionary["admin"]["lessonEditor"]["video"];
  common: Dictionary["common"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const processing = pending?.status === "processing" || pending?.status === "pending_upload";

  // While the provider processes the upload, check every 5 s and refresh when done.
  useEffect(() => {
    if (!pending || !processing || percent !== null) return;
    const timer = setInterval(async () => {
      try {
        const status = await api<AssetStatus>(`/api/v1/admin/media/${pending.id}`);
        if (status.status === "ready" || status.status === "failed") router.refresh();
      } catch {
        // keep polling
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [pending, processing, percent, router]);

  async function onFile(file: File) {
    setError(null);
    if (file.size > maxMb * 1024 * 1024) {
      setError(errors.UPLOAD_TOO_LARGE);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPercent(0);
    try {
      const durationSeconds = await probeVideoDuration(file);
      const started = await api<{ assetId: string; target: VideoUploadTarget }>(
        "/api/v1/admin/media/videos",
        {
          body: {
            lessonId,
            filename: file.name,
            sizeBytes: file.size,
            contentType: file.type || "video/mp4",
          },
        },
      );
      await uploadVideo(started.target, file, setPercent, controller.signal);
      const result = await api<AssetStatus>(`/api/v1/admin/media/${started.assetId}/complete`, {
        body: durationSeconds ? { durationSeconds } : {},
      });
      toast.success(result.status === "ready" ? labels.ready : labels.processing);
      router.refresh();
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        toast(labels.cancelled);
      } else {
        setError(
          caught instanceof Error && !("code" in caught)
            ? `${errors.generic} (${caught.message})`
            : errorMessage(caught, errors),
        );
      }
    } finally {
      abortRef.current = null;
      setPercent(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (!providerConfigured) {
    return (
      <Alert>
        <AlertDescription className="col-start-1">{labels.notConfigured}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-4" data-testid="video-uploader">
      {current ? (
        <div className="border-border flex flex-wrap items-center gap-3 rounded-xl border p-3">
          <span className="bg-muted grid size-10 place-items-center rounded-lg">
            <FilmIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-success inline-flex items-center gap-1.5 text-sm font-semibold">
              <CheckCircle2Icon className="size-4" />
              {labels.ready}
            </p>
            <p className="text-muted-foreground truncate text-xs" dir="ltr">
              {[
                current.filename,
                current.durationSeconds ? formatClock(current.durationSeconds) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {canRemove ? (
            <ApiActionDialog
              label={labels.remove}
              title={labels.remove}
              description={labels.removeBody}
              endpoint={`/api/v1/admin/content/lessons/${lessonId}/video`}
              method="DELETE"
              variant="ghost"
              size="sm"
              common={common}
              errors={errors}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{labels.none}</p>
      )}

      {pending && percent === null ? (
        pending.status === "failed" ? (
          <Alert variant="destructive">
            <AlertDescription className="text-foreground col-start-1">
              {format(labels.failed, { reason: pending.failureReason ?? "" })}
            </AlertDescription>
          </Alert>
        ) : (
          <p className="bg-info/10 text-info inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            {labels.processing}
            {current ? ` ${labels.pendingReplace}` : ""}
          </p>
        )
      ) : null}

      {percent !== null ? (
        <div className="grid gap-2">
          <div className="flex items-center justify-between text-sm">
            <span>{format(labels.uploading, { percent })}</span>
            <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
              <XIcon />
              {common.cancel}
            </Button>
          </div>
          <Progress value={percent} label={format(labels.uploading, { percent })} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            id={`video-file-${lessonId}`}
            data-testid="video-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
          <Button asChild variant={current ? "outline" : "default"}>
            <label htmlFor={`video-file-${lessonId}`} className="cursor-pointer">
              <UploadIcon />
              {current ? labels.replace : labels.upload}
            </label>
          </Button>
          <p className="text-muted-foreground text-xs">
            {format(labels.hint, {
              max: maxMb >= 1024 ? `${Math.round(maxMb / 1024)} GB` : `${maxMb} MB`,
            })}
          </p>
        </div>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground col-start-1">{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
