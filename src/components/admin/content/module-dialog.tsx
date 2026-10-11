"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { ACADEMY } from "@/config/academy";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { fromZonedInputValue, toZonedInputValue } from "@/lib/zoned-time";
import type { LocalizedText } from "@/server/db/schema";
import type { ContentStatus } from "@/shared/enums";

export type ModuleFormValue = {
  id?: string;
  title: LocalizedText;
  description: LocalizedText | null;
  status?: ContentStatus;
  publishAt?: string | null;
};

/** Create or edit a module (titles in Arabic and French; publication if allowed). */
export function ModuleDialog({
  courseId,
  initial,
  canPublish,
  trigger,
  triggerVariant = "default",
  triggerSize = "default",
  labels,
  common,
  errors,
}: {
  courseId: string;
  initial?: ModuleFormValue;
  canPublish: boolean;
  trigger: React.ReactNode;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  labels: { content: Dictionary["admin"]["content"]; lesson: Dictionary["admin"]["lessonEditor"] };
  common: Dictionary["common"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const t = labels.content;
  const [open, setOpen] = useState(false);
  const [titleAr, setTitleAr] = useState(initial?.title.ar ?? "");
  const [titleFr, setTitleFr] = useState(initial?.title.fr ?? "");
  const [descAr, setDescAr] = useState(initial?.description?.ar ?? "");
  const [descFr, setDescFr] = useState(initial?.description?.fr ?? "");
  const [status, setStatus] = useState<ContentStatus>(initial?.status ?? "draft");
  const [publishAt, setPublishAt] = useState(
    toZonedInputValue(initial?.publishAt ?? null, ACADEMY.timeZone),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idPrefix = initial?.id ?? "new-module";

  async function submit() {
    if (!titleAr.trim() && !titleFr.trim()) {
      setError(t.titleRequired);
      return;
    }
    setPending(true);
    setError(null);
    const title = { ar: titleAr, fr: titleFr };
    const description = { ar: descAr, fr: descFr };
    try {
      if (initial?.id) {
        await api(`/api/v1/admin/content/modules/${initial.id}`, {
          method: "PATCH",
          body: {
            title,
            description,
            ...(canPublish
              ? { status, publishAt: fromZonedInputValue(publishAt, ACADEMY.timeZone) }
              : {}),
          },
        });
        toast.success(t.saved);
      } else {
        await api("/api/v1/admin/content/modules", { body: { courseId, title, description } });
        toast.success(t.created);
        setTitleAr("");
        setTitleFr("");
        setDescAr("");
        setDescFr("");
      }
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, errors));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={common.close}>
        <DialogHeader>
          <DialogTitle>{initial?.id ? t.editModule : t.addModule}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.titleAr} htmlFor={`${idPrefix}-title-ar`}>
              <Input
                id={`${idPrefix}-title-ar`}
                dir="rtl"
                maxLength={200}
                value={titleAr}
                onChange={(event) => setTitleAr(event.target.value)}
              />
            </Field>
            <Field label={t.titleFr} htmlFor={`${idPrefix}-title-fr`}>
              <Input
                id={`${idPrefix}-title-fr`}
                dir="ltr"
                maxLength={200}
                value={titleFr}
                onChange={(event) => setTitleFr(event.target.value)}
              />
            </Field>
            <Field label={t.descriptionAr} htmlFor={`${idPrefix}-desc-ar`}>
              <Textarea
                id={`${idPrefix}-desc-ar`}
                dir="rtl"
                maxLength={2000}
                value={descAr}
                onChange={(event) => setDescAr(event.target.value)}
              />
            </Field>
            <Field label={t.descriptionFr} htmlFor={`${idPrefix}-desc-fr`}>
              <Textarea
                id={`${idPrefix}-desc-fr`}
                dir="ltr"
                maxLength={2000}
                value={descFr}
                onChange={(event) => setDescFr(event.target.value)}
              />
            </Field>
          </div>
          {initial?.id && canPublish ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={labels.lesson.status} htmlFor={`${idPrefix}-status`}>
                <NativeSelect
                  id={`${idPrefix}-status`}
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ContentStatus)}
                >
                  <option value="draft">{t.status.draft}</option>
                  <option value="published">{t.status.published}</option>
                  <option value="hidden">{t.status.hidden}</option>
                </NativeSelect>
              </Field>
              <Field
                label={labels.lesson.publishAt}
                htmlFor={`${idPrefix}-publish-at`}
                hint={labels.lesson.publishAtHint}
              >
                <Input
                  id={`${idPrefix}-publish-at`}
                  type="datetime-local"
                  dir="ltr"
                  value={publishAt}
                  onChange={(event) => setPublishAt(event.target.value)}
                />
              </Field>
            </div>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription className="text-foreground col-start-1">{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" loading={pending}>
            {initial?.id ? common.save : t.addModule}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Creates a lesson in a module and opens it in the editor. */
export function NewLessonDialog({
  moduleId,
  labels,
  common,
  errors,
  locale,
}: {
  moduleId: string;
  labels: Dictionary["admin"]["content"];
  common: Dictionary["common"];
  errors: Dictionary["errors"];
  locale: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [titleAr, setTitleAr] = useState("");
  const [titleFr, setTitleFr] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!titleAr.trim() && !titleFr.trim()) {
      setError(labels.titleRequired);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const lesson = await api<{ id: string }>("/api/v1/admin/content/lessons", {
        body: { moduleId, title: { ar: titleAr, fr: titleFr } },
      });
      toast.success(labels.created);
      setOpen(false);
      router.push(`/${locale}/admin/content/lessons/${lesson.id}`);
    } catch (caught) {
      setError(errorMessage(caught, errors));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {labels.addLesson}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={common.close}>
        <DialogHeader>
          <DialogTitle>{labels.addLesson}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={labels.titleAr} htmlFor={`${moduleId}-lesson-ar`}>
            <Input
              id={`${moduleId}-lesson-ar`}
              dir="rtl"
              maxLength={200}
              value={titleAr}
              onChange={(event) => setTitleAr(event.target.value)}
            />
          </Field>
          <Field label={labels.titleFr} htmlFor={`${moduleId}-lesson-fr`}>
            <Input
              id={`${moduleId}-lesson-fr`}
              dir="ltr"
              maxLength={200}
              value={titleFr}
              onChange={(event) => setTitleFr(event.target.value)}
            />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription className="text-foreground col-start-1">{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" loading={pending}>
            {labels.addLesson}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
