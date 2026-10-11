"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  LinkIcon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ApiActionDialog } from "@/components/admin/api-action-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { format, pickLocalized } from "@/i18n/format";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/media-format";
import type { LocalizedText } from "@/server/db/schema";
import type { LessonResourceKind } from "@/shared/enums";
import { putWithProgress } from "./uploads";

export type ResourceView = {
  id: string;
  kind: LessonResourceKind;
  title: LocalizedText;
  url: string | null;
  filename: string | null;
  sizeBytes: number | null;
};

const ICONS = {
  pdf: FileTextIcon,
  spreadsheet: FileSpreadsheetIcon,
  link: LinkIcon,
  file: FileIcon,
} as const;

const ACCEPT = [
  ".pdf",
  ".xlsx",
  ".xls",
  ".ods",
  ".csv",
  ".docx",
  ".doc",
  ".pptx",
  ".ppt",
  ".zip",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
].join(",");

/** Lesson resources: https links and uploaded files (stored privately). */
export function ResourcesEditor({
  lessonId,
  resources,
  storageConfigured,
  maxMb,
  locale,
  labels,
  titleLabels,
  common,
  errors,
}: {
  lessonId: string;
  resources: ResourceView[];
  storageConfigured: boolean;
  maxMb: number;
  locale: Locale;
  labels: Dictionary["admin"]["lessonEditor"]["resources"];
  titleLabels: { ar: string; fr: string };
  common: Dictionary["common"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "file" | null>(null);
  const [titleAr, setTitleAr] = useState("");
  const [titleFr, setTitleFr] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode(null);
    setTitleAr("");
    setTitleFr("");
    setUrl("");
    setFile(null);
    setPercent(null);
    setError(null);
  }

  async function submit() {
    setPending(true);
    setError(null);
    const fallback = file?.name.replace(/\.[^.]+$/, "") ?? "";
    const title = { ar: titleAr || (titleFr ? "" : fallback), fr: titleFr };
    try {
      if (mode === "link") {
        await api(`/api/v1/admin/content/lessons/${lessonId}/resources`, {
          body: { kind: "link", title, url },
        });
      } else if (mode === "file" && file) {
        if (file.size > maxMb * 1024 * 1024) throw new Error(errors.UPLOAD_TOO_LARGE);
        const contentType = file.type || "application/octet-stream";
        const started = await api<{
          assetId: string;
          target: { url: string; headers: Record<string, string> };
        }>(`/api/v1/admin/content/lessons/${lessonId}/resources`, {
          body: { kind: "file", title, filename: file.name, sizeBytes: file.size, contentType },
        });
        setPercent(0);
        await putWithProgress(
          started.target.url,
          file,
          started.target.headers,
          setPercent,
          new AbortController().signal,
        );
        await api(`/api/v1/admin/media/${started.assetId}/complete`, { body: {} });
      }
      toast.success(labels.added);
      reset();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error && !("code" in caught)
          ? caught.message
          : errorMessage(caught, errors),
      );
      setPercent(null);
    } finally {
      setPending(false);
    }
  }

  async function move(index: number, delta: number) {
    const order = resources.map((resource) => resource.id);
    const [moved] = order.splice(index, 1);
    order.splice(index + delta, 0, moved!);
    try {
      await api(`/api/v1/admin/content/lessons/${lessonId}/resource-order`, {
        method: "PUT",
        body: { resourceIds: order },
      });
      router.refresh();
    } catch (caught) {
      toast.error(errorMessage(caught, errors));
    }
  }

  return (
    <div className="grid gap-4" data-testid="resources-editor">
      {resources.length === 0 ? (
        <p className="text-muted-foreground text-sm">{labels.empty}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {resources.map((resource, index) => {
            const Icon = ICONS[resource.kind];
            return (
              <li
                key={resource.id}
                className="border-border flex min-w-0 flex-wrap items-center gap-3 rounded-xl border p-3"
              >
                <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {pickLocalized(resource.title, locale)}
                  </p>
                  <p className="text-muted-foreground truncate text-xs" dir="ltr">
                    {resource.kind === "link"
                      ? resource.url
                      : [resource.filename, formatBytes(resource.sizeBytes)]
                          .filter(Boolean)
                          .join(" · ")}
                  </p>
                </div>
                <span className="text-muted-foreground text-xs">{labels.kinds[resource.kind]}</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={common.previous}
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={common.next}
                    disabled={index === resources.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <ApiActionDialog
                    label={labels.removeTitle}
                    title={labels.removeTitle}
                    description={labels.removeBody}
                    endpoint={`/api/v1/admin/content/resources/${resource.id}`}
                    method="DELETE"
                    variant="ghost"
                    size="sm"
                    common={common}
                    errors={errors}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {mode ? (
        <form
          className="border-border bg-muted/30 grid gap-3 rounded-xl border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={titleLabels.ar} htmlFor="resource-title-ar">
              <Input
                id="resource-title-ar"
                dir="rtl"
                maxLength={200}
                value={titleAr}
                onChange={(event) => setTitleAr(event.target.value)}
              />
            </Field>
            <Field label={titleLabels.fr} htmlFor="resource-title-fr">
              <Input
                id="resource-title-fr"
                dir="ltr"
                maxLength={200}
                value={titleFr}
                onChange={(event) => setTitleFr(event.target.value)}
              />
            </Field>
          </div>
          {mode === "link" ? (
            <Field label={labels.url} htmlFor="resource-url">
              <Input
                id="resource-url"
                type="url"
                dir="ltr"
                required
                pattern="https://.*"
                placeholder="https://"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </Field>
          ) : (
            <Field
              label={labels.addFile}
              htmlFor="resource-file"
              hint={format(labels.fileHint, { max: `${maxMb} MB` })}
            >
              <Input
                id="resource-file"
                type="file"
                accept={ACCEPT}
                required
                data-testid="resource-file-input"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </Field>
          )}
          {percent !== null ? <Progress value={percent} label={`${percent}%`} /> : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription className="text-foreground col-start-1">{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              {common.cancel}
            </Button>
            <Button
              type="submit"
              loading={pending}
              disabled={
                (mode === "link" ? !url : !file) || (!titleAr && !titleFr && mode === "link")
              }
            >
              {common.save}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setMode("link")}>
            <LinkIcon />
            {labels.addLink}
          </Button>
          {storageConfigured ? (
            <Button variant="outline" size="sm" onClick={() => setMode("file")}>
              <UploadIcon />
              {labels.addFile}
            </Button>
          ) : (
            <p className="text-muted-foreground self-center text-xs">{labels.notConfigured}</p>
          )}
        </div>
      )}
    </div>
  );
}
