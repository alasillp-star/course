import Link from "next/link";
import {
  AwardIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CreditCardIcon,
  InfinityIcon,
  LineChartIcon,
  MailCheckIcon,
  PlayCircleIcon,
  QrCodeIcon,
  UsersIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActivationCardVisual } from "@/components/marketing/activation-card-visual";
import { format, pickLocalized } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getCourseOutline, getMainCourse } from "@/modules/catalog/catalog.service";

const STEP_ICONS = [CreditCardIcon, QrCodeIcon, InfinityIcon];
const FEATURE_ICONS = [PlayCircleIcon, UsersIcon, LineChartIcon, AwardIcon];

export default async function HomePage() {
  const { locale, dict } = await getI18n();
  const t = dict.home;
  const course = await getMainCourse();
  const outline = course ? await getCourseOutline(course.id) : [];

  return (
    <>
      {/* Hero */}
      <section className="surface-hero relative overflow-hidden text-white">
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-24 lg:pb-28">
          <div className="animate-fade-up">
            <Badge variant="outline" className="border-white/20 bg-white/5 px-3 py-1 text-white/80">
              <span className="bg-lime me-1 inline-block size-1.5 rounded-full" />
              {t.eyebrow}
            </Badge>
            <h1 className="mt-6 text-[2.15rem] leading-[1.2] font-bold tracking-tight text-balance sm:text-5xl lg:text-[3.35rem]">
              {t.title} <span className="text-lime">{t.titleHighlight}</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/72 sm:text-lg">
              {t.subtitle}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="lime" size="xl">
                <Link href={`/${locale}/activate`}>
                  <QrCodeIcon />
                  {t.primaryCta}
                </Link>
              </Button>
              <Button asChild variant="glass" size="xl">
                <Link href={`/${locale}/login`}>{t.secondaryCta}</Link>
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
              {t.trust.map((item) => (
                <li key={item} className="inline-flex items-center gap-2">
                  <CheckCircle2Icon className="text-lime size-4" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-center lg:justify-end">
            <ActivationCardVisual
              label={t.card.label}
              scan={t.card.scan}
              serialLabel={t.card.serial}
              className="animate-fade-up [animation-delay:150ms] lg:rotate-[-4deg]"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.how.title}</h2>
          <p className="text-muted-foreground mt-3">{t.how.subtitle}</p>
        </div>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {t.how.steps.map((step, index) => {
            const Icon = STEP_ICONS[index] ?? MailCheckIcon;
            return (
              <li
                key={step.title}
                className="group border-border bg-card shadow-soft hover:shadow-lifted relative rounded-2xl border p-6 transition hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between">
                  <span className="bg-primary text-primary-foreground dark:bg-lime/15 dark:text-lime grid size-11 place-items-center rounded-xl">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-muted tabular text-4xl font-bold">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-5 font-semibold">{step.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Curriculum (live from the database) */}
      <section id="curriculum" className="border-border bg-card/60 scroll-mt-20 border-y">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {course ? pickLocalized(course.title, locale) : t.curriculum.title}
            </h2>
            <p className="text-muted-foreground mt-3">
              {course?.subtitle ? pickLocalized(course.subtitle, locale) : t.curriculum.subtitle}
            </p>
          </div>
          {outline.length === 0 ? (
            <p className="border-border text-muted-foreground mt-8 rounded-2xl border border-dashed p-8 text-center">
              {t.curriculum.empty}
            </p>
          ) : (
            <ol className="mt-10 grid gap-3 md:grid-cols-2">
              {outline.map((module, index) => (
                <li
                  key={module.id}
                  className="border-border bg-background flex gap-4 rounded-2xl border p-5"
                >
                  <span className="bg-secondary text-highlight tabular grid size-10 shrink-0 place-items-center rounded-xl font-semibold">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs font-medium">
                      {format(t.curriculum.module, { n: index + 1 })} ·{" "}
                      {format(t.curriculum.lessons, { count: module.lessons.length })}
                    </p>
                    <p className="mt-1 font-semibold">{pickLocalized(module.title, locale)}</p>
                    {module.description ? (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                        {pickLocalized(module.description, locale)}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
          {t.features.title}
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.features.items.map((feature, index) => {
            const Icon = FEATURE_ICONS[index] ?? PlayCircleIcon;
            return (
              <div
                key={feature.title}
                className="border-border bg-card shadow-soft rounded-2xl border p-6"
              >
                <Icon className="text-highlight size-6" />
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{feature.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-border bg-card/60 scroll-mt-20 border-t">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.faq.title}</h2>
          <div className="divide-border border-border bg-background mt-8 divide-y rounded-2xl border">
            {t.faq.items.map((item) => (
              <details
                key={item.q}
                className="group p-5 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {item.q}
                  <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition group-open:rotate-180" />
                </summary>
                <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="surface-hero relative overflow-hidden rounded-3xl px-6 py-12 text-center text-white sm:px-12">
          <h2 className="text-2xl font-bold sm:text-3xl">{t.cta.title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/70">{t.cta.subtitle}</p>
          <Button asChild variant="lime" size="xl" className="mt-8">
            <Link href={`/${locale}/activate`}>
              <QrCodeIcon />
              {t.primaryCta}
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
