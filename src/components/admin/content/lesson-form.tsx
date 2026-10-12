"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { LessonMarkdown } from "@/components/learning/lesson-markdown";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ACADEMY } from "@/config/academy";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { fromZonedInputValue, toZonedInputValue } from "@/lib/zoned-time";
import type { LocalizedText } from "@/server/db/schema";
import type { ContentStatus } from "@/shared/enums";

export type LessonFormValue = {
  id: string;
  title: LocalizedText;
  summary: LocalizedText | null;
  body: LocalizedText | null;
  status: ContentStatus;
  publishAt: string | null;
  isFreePreview: boolean;
  completionThresholdPercent: number;
  durationSeconds: number | null;
  hasVideo: boolean;
};

function MarkdownField({
  id,
  label,
  dir,
  value,
  onChange,
  labels,
}: {
  id: string;
  label: string;
  dir: "rtl" | "ltr";
  value: string;
  onChange: (value: string) => void;
  labels: Dictionary["admin"]["lessonEditor"];
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <div className="bg-muted inline-flex rounded-lg p-0.5 text-xs">
          {[false, true].map((mode) => (
            <button
              key={String(mode)}
              type="button"
              onClick={() => setPreview(mode)}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium",
                preview === mode ? "bg-card shadow-soft" : "text-muted-foreground",
              )}
            >
              {mode ? labels.preview : labels.write}
            </button>
          ))}
        </div>
      </div>
      {preview ? (
        <div className="border-border min-h-40 rounded-lg border p-4" dir={dir}>
          {value.trim() ? (
            <LessonMarkdown source={value} />
          ) : (
            <p className="text-muted-foreground text-sm">{labels.nothingToPreview}</p>
          )}
        </div>
      ) : (
        <Textarea
          id={id}
          dir={dir}
          rows={10}
          maxLength={50_000}
          className="font-mono text-[13px] leading-6"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

/** Lesson details and publication. Publication fields need content.publish. */
export function LessonForm({
  lesson,
  canPublish,
  labels,
  contentLabels,
  errors,
}: {
  lesson: LessonFormValue;
  canPublish: boolean;
  labels: Dictionary["admin"]["lessonEditor"];
  contentLabels: Dictionary["admin"]["content"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [titleAr, setTitleAr] = useState(lesson.title.ar ?? "");
  const [titleFr, setTitleFr] = useState(lesson.title.fr ?? "");
  const [summaryAr, setSummaryAr] = useState(lesson.summary?.ar ?? "");
  const [summaryFr, setSummaryFr] = useState(lesson.summary?.fr ?? "");
  const [bodyAr, setBodyAr] = useState(lesson.body?.ar ?? "");
  const [bodyFr, setBodyFr] = useState(lesson.body?.fr ?? "");
  const [status, setStatus] = useState<ContentStatus>(lesson.status);
  const [publishAt, setPublishAt] = useState(toZonedInputValue(lesson.publishAt, ACADEMY.timeZone));
  const [threshold, setThreshold] = useState(lesson.completionThresholdPercent);
  const [minutes, setMinutes] = useState(
    lesson.durationSeconds ? String(Math.round(lesson.durationSeconds / 60)) : "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!titleAr.trim() && !titleFr.trim()) {
      setError(contentLabels.titleRequired);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api(`/api/v1/admin/content/lessons/${lesson.id}`, {
        method: "PATCH",
        body: {
          title: { ar: titleAr, fr: titleFr },
          summary: { ar: summaryAr, fr: summaryFr },
          body: { ar: bodyAr, fr: bodyFr },
          completionThresholdPercent: threshold,
          ...(lesson.hasVideo
            ? {}
            : { durationSeconds: minutes ? Math.round(Number(minutes) * 60) : null }),
          ...(canPublish
            ? {
                status,
                publishAt: fromZonedInputValue(publishAt, ACADEMY.timeZone),
              }
            : {}),
        },
      });
      toast.success(labels.saved);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, errors));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{labels.details}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={contentLabels.titleAr} htmlFor="lesson-title-ar">
              <Input
                id="lesson-title-ar"
                dir="rtl"
                maxLength={200}
                value={titleAr}
                onChange={(event) => setTitleAr(event.target.value)}
              />
            </Field>
            <Field label={contentLabels.titleFr} htmlFor="lesson-title-fr">
              <Input
                id="lesson-title-fr"
                dir="ltr"
                maxLength={200}
                value={titleFr}
                onChange={(event) => setTitleFr(event.target.value)}
              />
            </Field>
            <Field label={labels.summaryAr} htmlFor="lesson-summary-ar">
              <Textarea
                id="lesson-summary-ar"
                dir="rtl"
                rows={2}
                maxLength={2000}
                value={summaryAr}
                onChange={(event) => setSummaryAr(event.target.value)}
              />
            </Field>
            <Field label={labels.summaryFr} htmlFor="lesson-summary-fr">
              <Textarea
                id="lesson-summary-fr"
                dir="ltr"
                rows={2}
                maxLength={2000}
                value={summaryFr}
                onChange={(event) => setSummaryFr(event.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <MarkdownField
              id="lesson-body-ar"
              label={labels.bodyAr}
              dir="rtl"
              value={bodyAr}
              onChange={setBodyAr}
              labels={labels}
            />
            <MarkdownField
              id="lesson-body-fr"
              label={labels.bodyFr}
              dir="ltr"
              value={bodyFr}
              onChange={setBodyFr}
              labels={labels}
            />
          </div>
          <p className="text-muted-foreground text-xs">{labels.bodyHint}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={labels.threshold} htmlFor="lesson-threshold" hint={labels.thresholdHint}>
              <Input
                id="lesson-threshold"
                type="number"
                dir="ltr"
                min={1}
                max={100}
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value))}
              />
            </Field>
            {!lesson.hasVideo ? (
              <Field label={labels.duration} htmlFor="lesson-duration" hint={labels.durationHint}>
                <Input
                  id="lesson-duration"
                  type="number"
                  dir="ltr"
                  min={0}
                  max={1440}
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                />
              </Field>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.publication}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {canPublish ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={labels.status} htmlFor="lesson-status">
                  <NativeSelect
                    id="lesson-status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as ContentStatus)}
                  >
                    <option value="draft">{contentLabels.status.draft}</option>
                    <option value="published">{contentLabels.status.published}</option>
                    <option value="hidden">{contentLabels.status.hidden}</option>
                  </NativeSelect>
                </Field>
                <Field
                  label={labels.publishAt}
                  htmlFor="lesson-publish-at"
                  hint={labels.publishAtHint}
                >
                  <div className="flex gap-2">
                    <Input
                      id="lesson-publish-at"
                      type="datetime-local"
                      dir="ltr"
                      value={publishAt}
                      onChange={(event) => setPublishAt(event.target.value)}
                    />
                    {publishAt ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPublishAt("")}
                      >
                        {labels.clearSchedule}
                      </Button>
                    ) : null}
                  </div>
                </Field>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{labels.noPublishPermission}</p>
          )}
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground col-start-1">{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="bg-background/90 border-border shadow-soft sticky bottom-3 z-10 flex justify-end gap-2 rounded-2xl border px-4 py-3 backdrop-blur">
        <Button type="submit" size="lg" loading={pending}>
          {labels.save}
        </Button>
      </div>
    </form>
  );
}
