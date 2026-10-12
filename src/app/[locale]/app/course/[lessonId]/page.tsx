import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ClockIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  LinkIcon,
  ListIcon,
  LockIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { CompleteLessonButton } from "@/components/learning/complete-lesson-button";
import { CourseOutline } from "@/components/learning/course-outline";
import { LessonMarkdown } from "@/components/learning/lesson-markdown";
import { LessonNotes } from "@/components/learning/lesson-notes";
import { LessonPlayerProvider } from "@/components/learning/player-context";
import { VideoPlayer } from "@/components/learning/video-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Locale } from "@/i18n/config";
import { format, pickLocalized } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { formatBytes, minutesOf } from "@/lib/media-format";
import { requirePageActor } from "@/modules/identity/current";
import { getLessonPage } from "@/modules/learning/lesson.service";
import { isAppError } from "@/server/http/errors";
import { uuidSchema } from "@/server/http/schemas";

const loadLesson = cache(async (locale: Locale, lessonId: string) => {
  if (!uuidSchema.safeParse(lessonId).success) notFound();
  const actor = await requirePageActor(locale, { next: `/${locale}/app/course/${lessonId}` });
  try {
    return { data: await getLessonPage(actor, lessonId) };
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "COURSE_ACCESS_REQUIRED") return { data: null };
    throw error;
  }
});

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/course/[lessonId]">): Promise<Metadata> {
  const { locale, dict } = await getI18n();
  const { data } = await loadLesson(locale, (await params).lessonId);
  return { title: data ? pickLocalized(data.lesson.title, locale) : dict.student.nav.course };
}

const RESOURCE_ICONS = {
  pdf: FileTextIcon,
  spreadsheet: FileSpreadsheetIcon,
  link: LinkIcon,
  file: FileIcon,
} as const;

export default async function LessonPage({
  params,
  searchParams,
}: PageProps<"/[locale]/app/course/[lessonId]">) {
  const { locale, dict, dir } = await getI18n();
  const { lessonId } = await params;
  const t = dict.student.lesson;
  const { data } = await loadLesson(locale, lessonId);

  if (!data) {
    return (
      <section className="border-border bg-card mx-auto grid max-w-xl justify-items-center gap-4 rounded-3xl border border-dashed p-10 text-center">
        <LockIcon className="text-highlight size-10" />
        <h1 className="text-xl font-bold">{t.locked}</h1>
        <p className="text-muted-foreground">{dict.errors.COURSE_ACCESS_REQUIRED}</p>
        <Button asChild size="lg">
          <Link href={`/${locale}/activate`}>{dict.common.activateCard}</Link>
        </Button>
      </section>
    );
  }

  const requested = Number((await searchParams).t);
  const startAt =
    Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : data.progress.resumeAt;
  const allLessons = data.outline.flatMap((module) => module.lessons);
  const index = allLessons.findIndex((lesson) => lesson.current);
  const completedCount = allLessons.filter((lesson) => lesson.completed).length;
  const coursePercent = allLessons.length
    ? Math.round((completedCount / allLessons.length) * 100)
    : 0;
  const completed = data.progress.status === "completed";
  const minutes = minutesOf(data.lesson.durationSeconds);
  const lessonHref = (id: string) => `/${locale}/app/course/${id}`;
  const body = pickLocalized(data.lesson.body, locale);
  const summary = pickLocalized(data.lesson.summary, locale);
  const outlineLabels = { minutes: t.minutes, locked: t.locked, completed: t.completed };

  const outlinePanel = (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold">{pickLocalized(data.course.title, locale)}</span>
          <span className="tabular text-muted-foreground">{coursePercent}%</span>
        </div>
        <Progress value={coursePercent} label={dict.student.dashboard.progress} />
      </div>
      <CourseOutline outline={data.outline} locale={locale} labels={outlineLabels} compact />
    </div>
  );

  return (
    <LessonPlayerProvider>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="grid min-w-0 content-start gap-5">
          {data.access.preview ? (
            <p className="border-info/30 bg-info/10 text-info flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium">
              <EyeIcon className="size-4 shrink-0" />
              {t.previewBanner}
            </p>
          ) : null}

          {data.lesson.hasVideo ? (
            data.lesson.videoReady ? (
              <div className="grid gap-2">
                <VideoPlayer
                  lessonId={data.lesson.id}
                  startAt={startAt}
                  tracked={data.access.tracked}
                  initiallyCompleted={completed}
                  nextHref={data.next ? lessonHref(data.next) : null}
                  labels={t.player}
                  unavailableLabel={t.videoUnavailable}
                  completedToast={t.completedToast}
                />
                <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                  <ShieldCheckIcon className="size-3.5" />
                  {t.player.watermarkNote}
                </p>
              </div>
            ) : (
              <div className="bg-muted text-muted-foreground grid aspect-video place-items-center rounded-2xl p-6 text-center text-sm">
                {t.videoProcessing}
              </div>
            )
          ) : null}

          <header className="grid gap-3">
            <p className="text-muted-foreground text-xs font-medium">
              {pickLocalized(data.module.title, locale)}
              {index >= 0
                ? ` · ${format(t.lessonOf, { index: index + 1, total: allLessons.length })}`
                : ""}
            </p>
            <h1 className="text-xl leading-snug font-bold tracking-tight sm:text-2xl">
              {pickLocalized(data.lesson.title, locale)}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {minutes ? (
                <Badge variant="muted">
                  <ClockIcon />
                  {format(t.minutes, { count: minutes })}
                </Badge>
              ) : null}
              {completed ? (
                <Badge variant="success">{t.completed}</Badge>
              ) : data.lesson.hasVideo && data.progress.percent > 0 ? (
                <Badge variant="outline">
                  {format(t.watched, { percent: data.progress.percent })}
                </Badge>
              ) : null}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="ms-auto lg:hidden">
                    <ListIcon />
                    {t.openOutline}
                  </Button>
                </SheetTrigger>
                <SheetContent className="max-w-sm overflow-y-auto" closeLabel={dict.common.close}>
                  <SheetTitle className="text-base font-semibold">{t.courseContent}</SheetTitle>
                  {outlinePanel}
                </SheetContent>
              </Sheet>
            </div>
            {data.access.tracked ? (
              data.lesson.hasVideo ? (
                !completed ? (
                  <p className="text-muted-foreground text-xs">
                    {format(t.autoCompleteHint, {
                      percent: data.lesson.completionThresholdPercent,
                    })}
                  </p>
                ) : null
              ) : (
                <div>
                  <CompleteLessonButton
                    lessonId={data.lesson.id}
                    completed={completed}
                    labels={{
                      markComplete: t.markComplete,
                      completed: t.completed,
                      completedToast: t.completedToast,
                    }}
                    errors={dict.errors}
                  />
                </div>
              )
            ) : null}
          </header>

          <Tabs defaultValue="overview" dir={dir}>
            <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
              <TabsTrigger value="overview">{t.overview}</TabsTrigger>
              <TabsTrigger value="resources">
                {t.resources}
                {data.resources.length ? (
                  <span className="bg-muted-foreground/15 tabular rounded-full px-1.5 text-[11px]">
                    {data.resources.length}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="notes">{t.notes}</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Card>
                <CardContent className="grid gap-4 pt-5">
                  {summary ? <p className="text-muted-foreground font-medium">{summary}</p> : null}
                  {body ? (
                    <LessonMarkdown source={body} />
                  ) : !data.lesson.hasVideo ? (
                    <p className="text-muted-foreground text-sm">{t.noVideo}</p>
                  ) : null}
                  {!summary && !body && data.lesson.hasVideo ? (
                    <p className="text-muted-foreground text-sm">
                      {pickLocalized(data.lesson.title, locale)}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="resources">
              {data.resources.length === 0 ? (
                <p className="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center text-sm">
                  {t.noResources}
                </p>
              ) : (
                <ul className="grid gap-2">
                  {data.resources.map((resource) => {
                    const Icon = RESOURCE_ICONS[resource.kind];
                    const isLink = resource.kind === "link";
                    return (
                      <li
                        key={resource.id}
                        className="border-border bg-card flex items-center gap-3 rounded-xl border p-3"
                      >
                        <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                          <Icon className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {pickLocalized(resource.title, locale)}
                          </p>
                          <p className="text-muted-foreground truncate text-xs" dir="ltr">
                            {isLink
                              ? new URL(resource.url ?? "https://invalid").hostname
                              : [resource.filename, formatBytes(resource.sizeBytes)]
                                  .filter(Boolean)
                                  .join(" · ")}
                          </p>
                        </div>
                        <Button asChild variant="outline" size="sm">
                          {isLink ? (
                            <a
                              href={resource.url ?? "#"}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                            >
                              <ExternalLinkIcon />
                              <span className="sr-only sm:not-sr-only">
                                {dict.admin.lessonEditor.resources.kinds.link}
                              </span>
                            </a>
                          ) : (
                            <a href={`/api/v1/lessons/${data.lesson.id}/resources/${resource.id}`}>
                              <DownloadIcon />
                              <span className="sr-only sm:not-sr-only">{dict.common.download}</span>
                            </a>
                          )}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="notes">
              <LessonNotes
                lessonId={data.lesson.id}
                initialNotes={data.notes.map((note) => ({
                  id: note.id,
                  body: note.body,
                  videoTimestampSeconds: note.videoTimestampSeconds,
                }))}
                hasVideo={data.lesson.hasVideo && data.lesson.videoReady}
                labels={t.notesPanel}
                common={dict.common}
                errors={dict.errors}
              />
            </TabsContent>
          </Tabs>

          <nav
            className="border-border flex items-center justify-between gap-3 border-t pt-5"
            aria-label={t.courseContent}
          >
            {data.previous ? (
              <Button asChild variant="outline">
                <Link href={lessonHref(data.previous)}>
                  <ArrowLeftIcon className="rtl:rotate-180" />
                  {t.previous}
                </Link>
              </Button>
            ) : (
              <span />
            )}
            {data.next ? (
              <Button asChild variant={completed ? "lime" : "default"}>
                <Link href={lessonHref(data.next)}>
                  {t.next}
                  <ArrowRightIcon className="rtl:rotate-180" />
                </Link>
              </Button>
            ) : null}
          </nav>
        </div>

        <aside className="hidden lg:block">
          <Card className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto">
            <CardContent className="pt-5">{outlinePanel}</CardContent>
          </Card>
        </aside>
      </div>
    </LessonPlayerProvider>
  );
}
