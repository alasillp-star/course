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
import { ACADEMY } from "@/config/academy";
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
        <div className="grid-pattern pointer-events-none absolute inset-0 opacity-[0.07] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-24 lg:pb-28">
          <div className="animate-fade-up">
            <Badge variant="outline" className="border-white/20 bg-white/5 px-3 py-1 text-white/80">
              <span className="me-1 inline-block size-1.5 rounded-full bg-gold" />
              {t.eyebrow}
            </Badge>
            <h1 className="mt-6 text-[2.15rem] leading-[1.2] font-bold tracking-tight text-balance sm:text-5xl lg:text-[3.35rem]">
              {t.title} <span className="text-gradient-gold">{t.titleHighlight}</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/72 sm:text-lg">{t.subtitle}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="gold" size="xl">
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
                  <CheckCircle2Icon className="size-4 text-gold" />
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
              academy={ACADEMY.shortName}
              className="animate-fade-up [animation-delay:150ms] lg:rotate-[-4deg]"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.how.title}</h2>
          <p className="mt-3 text-muted-foreground">{t.how.subtitle}</p>
        </div>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {t.how.steps.map((step, index) => {
            const Icon = STEP_ICONS[index] ?? MailCheckIcon;
            return (
              <li key={step.title} className="group relative rounded-2xl border border-border bg-card p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lifted">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground dark:bg-gold/15 dark:text-gold">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-4xl font-bold text-muted tabular">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-5 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Curriculum (live from the database) */}
      <section id="curriculum" className="scroll-mt-20 border-y border-border bg-card/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {course ? pickLocalized(course.title, locale) : t.curriculum.title}
            </h2>
            <p className="mt-3 text-muted-foreground">
              {course?.subtitle ? pickLocalized(course.subtitle, locale) : t.curriculum.subtitle}
            </p>
          </div>
          {outline.length === 0 ? (
            <p className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
              {t.curriculum.empty}
            </p>
          ) : (
            <ol className="mt-10 grid gap-3 md:grid-cols-2">
              {outline.map((module, index) => (
                <li key={module.id} className="flex gap-4 rounded-2xl border border-border bg-background p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 font-semibold text-accent-foreground tabular dark:text-gold">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      {format(t.curriculum.module, { n: index + 1 })} ·{" "}
                      {format(t.curriculum.lessons, { count: module.lessons.length })}
                    </p>
                    <p className="mt-1 font-semibold">{pickLocalized(module.title, locale)}</p>
                    {module.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
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
        <h2 className="max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">{t.features.title}</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.features.items.map((feature, index) => {
            const Icon = FEATURE_ICONS[index] ?? PlayCircleIcon;
            return (
              <div key={feature.title} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                <Icon className="size-6 text-gold-strong dark:text-gold" />
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-border bg-card/60">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.faq.title}</h2>
          <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-background">
            {t.faq.items.map((item) => (
              <details key={item.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {item.q}
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
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
          <Button asChild variant="gold" size="xl" className="mt-8">
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
