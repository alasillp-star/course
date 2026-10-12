import type { Metadata } from "next";
import Link from "next/link";
import { EyeIcon, InfinityIcon, PlayIcon, QrCodeIcon } from "lucide-react";
import { CourseOutline } from "@/components/learning/course-outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/stat-card";
import { format, pickLocalized } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { requirePageActor } from "@/modules/identity/current";
import { getCourseOverview } from "@/modules/learning/dashboard.service";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.student.nav.course };
}

export default async function CoursePage() {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { next: `/${locale}/app/course` });
  const data = await getCourseOverview(actor);
  const t = dict.student.dashboard;
  const tl = dict.student.lesson;

  if (!data) return <EmptyState title={dict.admin.content.noCourse} />;

  return (
    <div className="grid gap-6">
      <section className="surface-hero shadow-lifted relative overflow-hidden rounded-3xl p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          {data.hasAccess ? (
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
          ) : data.staffPreview ? (
            <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
              <EyeIcon />
              {tl.teamPreview}
            </Badge>
          ) : null}
        </div>
        <h1 className="mt-4 text-2xl leading-snug font-bold sm:text-3xl">
          {pickLocalized(data.course.title, locale)}
        </h1>
        {data.course.subtitle ? (
          <p className="mt-2 max-w-2xl text-white/75">
            {pickLocalized(data.course.subtitle, locale)}
          </p>
        ) : null}
        <div className="mt-6 grid max-w-xl gap-2">
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
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {data.continueLesson ? (
            <Button asChild variant="lime" size="lg">
              <Link href={`/${locale}/app/course/${data.continueLesson.id}`}>
                <PlayIcon />
                {data.started ? t.continueLearning : t.startLearning}
              </Link>
            </Button>
          ) : null}
          {!data.hasAccess && !data.staffPreview ? (
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/25 bg-white/10 text-white hover:bg-white/20"
            >
              <Link href={`/${locale}/activate`}>
                <QrCodeIcon />
                {dict.common.activateCard}
              </Link>
            </Button>
          ) : null}
          {data.continueLesson ? (
            <p className="text-sm text-white/70">
              {format(t.nextUp, { title: pickLocalized(data.continueLesson.title, locale) })}
            </p>
          ) : null}
        </div>
      </section>

      <Card>
        <CardContent className="pt-6">
          {data.outline.length === 0 ? (
            <EmptyState title={t.courseContent} />
          ) : (
            <CourseOutline
              outline={data.outline}
              locale={locale}
              labels={{ minutes: tl.minutes, locked: tl.locked, completed: tl.completed }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
