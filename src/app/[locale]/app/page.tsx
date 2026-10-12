import type { Metadata } from "next";
import Link from "next/link";
import {
  AwardIcon,
  BellIcon,
  BookOpenIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  EyeIcon,
  InfinityIcon,
  MessagesSquareIcon,
  NotebookPenIcon,
  PlayIcon,
  QrCodeIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/stat-card";
import { format, formatDateTime, pickLocalized, formatRelative } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { notificationHref, notificationText } from "@/i18n/notification-text";
import { requirePageActor } from "@/modules/identity/current";
import { getStudentDashboard } from "@/modules/learning/dashboard.service";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.student.nav.dashboard };
}

function minutes(seconds: number | null) {
  return seconds ? `${Math.max(1, Math.round(seconds / 60))}′` : "";
}

export default async function StudentDashboardPage({ searchParams }: PageProps<"/[locale]/app">) {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { next: `/${locale}/app` });
  const data = await getStudentDashboard(actor);
  const t = dict.student.dashboard;
  const isWelcome = (await searchParams).welcome === "1";
  const name = data.displayName ?? actor.email.split("@")[0] ?? "";

  return (
    <div className="grid gap-6">
      <section className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {isWelcome ? t.welcomeFirst : format(t.welcome, { name })}
        </h1>
        <p className="text-muted-foreground mt-1">{t.subtitle}</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid min-w-0 gap-6">
          {data.course && data.hasAccess ? (
            <section className="surface-hero shadow-lifted relative overflow-hidden rounded-3xl p-6 text-white sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                {data.staffPreview ? (
                  <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
                    <EyeIcon />
                    {dict.student.lesson.teamPreview}
                  </Badge>
                ) : (
                  <>
                    <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
                      <span className="bg-success size-1.5 rounded-full" />
                      {t.accessActive}
                    </Badge>
                    <Badge variant="outline" className="border-lime/40 bg-lime/15 text-lime">
                      <InfinityIcon />
                      {t.lifetime}
                    </Badge>
                  </>
                )}
              </div>
              <h2 className="mt-4 text-xl leading-snug font-bold sm:text-2xl">
                {pickLocalized(data.course.title, locale)}
              </h2>
              <div className="mt-6 grid gap-2">
                <div className="flex items-center justify-between text-sm text-white/75">
                  <span>{t.progress}</span>
                  <span className="tabular font-semibold text-white">{data.percent}%</span>
                </div>
                <Progress
                  value={data.percent}
                  className="bg-white/15"
                  indicatorClassName="bg-lime"
                  label={t.progress}
                />
                <p className="text-xs text-white/60">
                  {format(t.lessonsDone, { done: data.completedLessons, total: data.totalLessons })}
                </p>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild variant="lime" size="lg">
                  <Link
                    href={
                      data.continueLesson
                        ? `/${locale}/app/course/${data.continueLesson.id}`
                        : `/${locale}/app/course`
                    }
                  >
                    <PlayIcon />
                    {data.completedLessons > 0 ? t.continueLearning : t.startLearning}
                  </Link>
                </Button>
                {data.continueLesson ? (
                  <p className="min-w-0 truncate text-sm text-white/70">
                    {format(t.nextUp, { title: pickLocalized(data.continueLesson.title, locale) })}
                  </p>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="border-border bg-card rounded-3xl border border-dashed p-8 text-center">
              <QrCodeIcon className="text-highlight mx-auto size-10" />
              <h2 className="mt-4 text-xl font-bold">{t.noAccessTitle}</h2>
              <p className="text-muted-foreground mx-auto mt-2 max-w-md">{t.noAccessBody}</p>
              <Button asChild size="lg" className="mt-6">
                <Link href={`/${locale}/activate`}>{dict.common.activateCard}</Link>
              </Button>
            </section>
          )}

          {data.outline.length > 0 ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="inline-flex items-center gap-2">
                  <BookOpenIcon className="size-4" />
                  {t.courseContent}
                </CardTitle>
                <span className="text-muted-foreground text-xs">
                  {format(t.modules, { count: data.outline.length })} ·{" "}
                  {format(t.lessons, { count: data.totalLessons })}
                </span>
              </CardHeader>
              <CardContent className="grid gap-2">
                {data.outline.map((module, index) => (
                  <details
                    key={module.id}
                    className="group border-border bg-background/60 rounded-xl border"
                    open={index === 0}
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                      <span className="bg-muted tabular grid size-8 shrink-0 place-items-center rounded-lg text-sm font-semibold">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 font-medium">
                        {pickLocalized(module.title, locale)}
                      </span>
                      <span className="text-muted-foreground tabular text-xs">
                        {module.completedLessons}/{module.lessons.length}
                      </span>
                    </summary>
                    <ul className="grid gap-1 px-4 pb-4">
                      {module.lessons.map((lesson) => (
                        <li key={lesson.id}>
                          <Link
                            href={`/${locale}/app/course/${lesson.id}`}
                            className="text-muted-foreground hover:bg-muted flex items-center gap-3 rounded-lg px-2 py-2 text-sm"
                          >
                            {lesson.completed ? (
                              <CheckCircle2Icon className="text-success size-4 shrink-0" />
                            ) : (
                              <PlayIcon className="size-3.5 shrink-0" />
                            )}
                            <span className="text-foreground/90 min-w-0 flex-1 truncate">
                              {pickLocalized(lesson.title, locale)}
                            </span>
                            <span className="tabular text-xs">
                              {minutes(lesson.durationSeconds)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="inline-flex items-center gap-2">
                  <ClipboardCheckIcon className="size-4" />
                  {t.assignments}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.assignments.length === 0 ? (
                  <EmptyState title={t.noAssignments} className="py-6" />
                ) : (
                  <ul className="grid gap-2 text-sm">
                    {data.assignments.map((assignment) => (
                      <li key={assignment.id} className="bg-muted/60 rounded-lg px-3 py-2">
                        {pickLocalized(assignment.title, locale)}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="inline-flex items-center gap-2">
                  <MessagesSquareIcon className="size-4" />
                  {t.community}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.communityPosts.length === 0 ? (
                  <EmptyState title={t.noCommunity} className="py-6" />
                ) : (
                  <ul className="grid gap-2 text-sm">
                    {data.communityPosts.map((post) => (
                      <li key={post.id} className="bg-muted/60 rounded-lg px-3 py-2">
                        <p className="line-clamp-1 font-medium">{post.title ?? post.body}</p>
                        <p className="text-muted-foreground text-xs">
                          {formatRelative(post.createdAt, locale)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <aside className="grid content-start gap-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="inline-flex items-center gap-2">
                <BellIcon className="size-4" />
                {t.notifications}
              </CardTitle>
              {data.unreadNotifications > 0 ? (
                <Badge variant="brand">{data.unreadNotifications}</Badge>
              ) : null}
            </CardHeader>
            <CardContent>
              {data.notifications.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t.noNotifications}</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {data.notifications.map((notification) => {
                    const href = notificationHref(locale, notification.link);
                    const text = notificationText(dict, locale, notification);
                    return (
                      <li key={notification.id} className="bg-muted/60 rounded-lg px-3 py-2">
                        {href ? (
                          <Link href={href} className="font-medium hover:underline">
                            {text}
                          </Link>
                        ) : (
                          <p className="font-medium">{text}</p>
                        )}
                        <p className="text-muted-foreground text-xs">
                          {formatRelative(notification.createdAt, locale)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2">
                <CalendarClockIcon className="size-4" />
                {t.upcomingLive}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.upcoming.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t.noLive}</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {data.upcoming.map((session) => (
                    <li key={session.id} className="bg-muted/60 rounded-lg px-3 py-2">
                      <p className="font-medium">{session.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatDateTime(session.startsAt, locale)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2">
                <NotebookPenIcon className="size-4" />
                {t.notes}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {data.notesCount > 0 ? (
                  <span className="text-foreground tabular text-2xl font-semibold">
                    {data.notesCount}
                  </span>
                ) : (
                  t.noNotes
                )}
              </p>
              {data.notesCount > 0 ? (
                <Link
                  href={`/${locale}/app/notes`}
                  className="text-highlight mt-2 inline-block text-sm font-semibold"
                >
                  {t.allNotes}
                </Link>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2">
                <AwardIcon className="size-4" />
                {t.certificates}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.certificates.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t.noCertificates}</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {data.certificates.map((certificate) => (
                    <li key={certificate.id} className="bg-muted/60 rounded-lg px-3 py-2">
                      <p className="font-medium">
                        {pickLocalized(certificate.courseTitle, locale)}
                      </p>
                      <p className="text-muted-foreground font-mono text-xs" dir="ltr">
                        {certificate.number}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
