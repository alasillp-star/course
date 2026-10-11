import type { Metadata } from "next";
import Link from "next/link";
import {
  AwardIcon,
  BellIcon,
  BookOpenIcon,
  CalendarClockIcon,
  ClipboardCheckIcon,
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
        <p className="mt-1 text-muted-foreground">{t.subtitle}</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid min-w-0 gap-6">
          {data.course && data.hasAccess ? (
            <section className="surface-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-lifted sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
                  <span className="size-1.5 rounded-full bg-success" />
                  {t.accessActive}
                </Badge>
                <Badge variant="outline" className="border-gold/40 bg-gold/15 text-gold">
                  <InfinityIcon />
                  {t.lifetime}
                </Badge>
              </div>
              <h2 className="mt-4 text-xl leading-snug font-bold sm:text-2xl">{pickLocalized(data.course.title, locale)}</h2>
              <div className="mt-6 grid gap-2">
                <div className="flex items-center justify-between text-sm text-white/75">
                  <span>{t.progress}</span>
                  <span className="font-semibold text-white tabular">{data.percent}%</span>
                </div>
                <Progress value={data.percent} className="bg-white/15" label={t.progress} />
                <p className="text-xs text-white/60">
                  {format(t.lessonsDone, { done: data.completedLessons, total: data.totalLessons })}
                </p>
              </div>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button variant="gold" size="lg" disabled>
                  <PlayIcon />
                  {data.completedLessons > 0 ? t.continueLearning : t.startLearning}
                </Button>
                <p className="text-xs text-white/60">{t.lessonPlayerSoon}</p>
              </div>
            </section>
          ) : (
            <section className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
              <QrCodeIcon className="mx-auto size-10 text-gold-strong dark:text-gold" />
              <h2 className="mt-4 text-xl font-bold">{t.noAccessTitle}</h2>
              <p className="mx-auto mt-2 max-w-md text-muted-foreground">{t.noAccessBody}</p>
              <Button asChild variant="gold" size="lg" className="mt-6">
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
                <span className="text-xs text-muted-foreground">
                  {format(t.modules, { count: data.outline.length })} · {format(t.lessons, { count: data.totalLessons })}
                </span>
              </CardHeader>
              <CardContent className="grid gap-2">
                {data.outline.map((module, index) => (
                  <details key={module.id} className="group rounded-xl border border-border bg-background/60" open={index === 0}>
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold tabular">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 font-medium">{pickLocalized(module.title, locale)}</span>
                      <span className="text-xs text-muted-foreground tabular">
                        {module.completedLessons}/{module.lessons.length}
                      </span>
                    </summary>
                    <ul className="grid gap-1 px-4 pb-4">
                      {module.lessons.map((lesson) => (
                        <li key={lesson.id} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-muted-foreground">
                          <PlayIcon className="size-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate text-foreground/90">{pickLocalized(lesson.title, locale)}</span>
                          <span className="text-xs tabular">{minutes(lesson.durationSeconds)}</span>
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
                      <li key={assignment.id} className="rounded-lg bg-muted/60 px-3 py-2">
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
                      <li key={post.id} className="rounded-lg bg-muted/60 px-3 py-2">
                        <p className="line-clamp-1 font-medium">{post.title ?? post.body}</p>
                        <p className="text-xs text-muted-foreground">{formatRelative(post.createdAt, locale)}</p>
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
              {data.unreadNotifications > 0 ? <Badge variant="gold">{data.unreadNotifications}</Badge> : null}
            </CardHeader>
            <CardContent>
              {data.notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.noNotifications}</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {data.notifications.map((notification) => (
                    <li key={notification.id} className="rounded-lg bg-muted/60 px-3 py-2">
                      <p className="font-medium">{notification.type}</p>
                      <p className="text-xs text-muted-foreground">{formatRelative(notification.createdAt, locale)}</p>
                    </li>
                  ))}
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
                <p className="text-sm text-muted-foreground">{t.noLive}</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {data.upcoming.map((session) => (
                    <li key={session.id} className="rounded-lg bg-muted/60 px-3 py-2">
                      <p className="font-medium">{session.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(session.startsAt, locale)}</p>
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
              <p className="text-sm text-muted-foreground">
                {data.notesCount > 0 ? <span className="text-2xl font-semibold text-foreground tabular">{data.notesCount}</span> : t.noNotes}
              </p>
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
                <p className="text-sm text-muted-foreground">{t.noCertificates}</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {data.certificates.map((certificate) => (
                    <li key={certificate.id} className="rounded-lg bg-muted/60 px-3 py-2">
                      <p className="font-medium">{pickLocalized(certificate.courseTitle, locale)}</p>
                      <p className="font-mono text-xs text-muted-foreground" dir="ltr">
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
