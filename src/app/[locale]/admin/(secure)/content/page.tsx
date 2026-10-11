import type { Metadata } from "next";
import Link from "next/link";
import { FilesIcon, FilmIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { OutlineEditor, type OutlineModuleView } from "@/components/admin/content/outline-editor";
import { ProviderTestButton } from "@/components/admin/content/provider-status";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/stat-card";
import { ACADEMY } from "@/config/academy";
import { pickLocalized } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { can } from "@/modules/access/actor";
import { getEditorOutline, listEditableCourses } from "@/modules/content/content.service";
import { displayStatus } from "@/modules/content/display";
import { requirePageActor } from "@/modules/identity/current";
import { sha256Hex } from "@/server/crypto";
import { getEnv } from "@/server/env";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.admin.content.title };
}

const PROVIDER_NAMES: Record<string, string> = {
  mux: "Mux",
  cloudflare_stream: "Cloudflare Stream",
  s3: "S3",
};

export default async function ContentPage({ searchParams }: PageProps<"/[locale]/admin/content">) {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, {
    adminArea: true,
    permission: "content.read",
    next: `/${locale}/admin/content`,
  });
  const t = dict.admin.content;
  const courses = await listEditableCourses(actor);
  const requested = (await searchParams).course;
  const course =
    courses.find((item) => item.id === requested) ??
    courses.find((item) => item.slug === ACADEMY.mainCourseSlug) ??
    courses[0];
  if (!course) return <EmptyState title={t.noCourse} />;

  const { modules } = await getEditorOutline(actor, course.id);
  const view: OutlineModuleView[] = modules.map((module) => ({
    id: module.id,
    title: module.title,
    description: module.description,
    status: module.status,
    publishAt: module.publishAt?.toISOString() ?? null,
    displayStatus: displayStatus(module.status, module.publishAt),
    lessons: module.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      displayStatus: displayStatus(lesson.status, lesson.publishAt),
      isFreePreview: lesson.isFreePreview,
      videoStatus: lesson.video?.status ?? "none",
      pendingVideoStatus: lesson.pendingVideo?.status ?? null,
      resourceCount: lesson.resourceCount,
    })),
  }));
  // Remount the client editor whenever the server data changes (after each save).
  const signature = sha256Hex(JSON.stringify(view)).slice(0, 16);
  const env = getEnv();
  const providerLabel = (name: string) =>
    name === "none"
      ? t.providers.notConfigured
      : name === "local"
        ? t.providers.local
        : (PROVIDER_NAMES[name] ?? name);

  return (
    <div>
      <PageHeader
        title={t.title}
        description={t.subtitle}
        actions={
          can(actor, "media.manage") ? (
            <ProviderTestButton labels={t.providers} errors={dict.errors} />
          ) : null
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={env.VIDEO_PROVIDER === "none" ? "warning" : "outline"}>
          <FilmIcon />
          {t.providers.video}: {providerLabel(env.VIDEO_PROVIDER)}
        </Badge>
        <Badge variant={env.STORAGE_PROVIDER === "none" ? "warning" : "outline"}>
          <FilesIcon />
          {t.providers.storage}: {providerLabel(env.STORAGE_PROVIDER)}
        </Badge>
        {courses.length > 1 ? (
          <nav className="ms-auto flex flex-wrap gap-1">
            {courses.map((item) => (
              <Link
                key={item.id}
                href={`/${locale}/admin/content?course=${item.id}`}
                aria-current={item.id === course.id ? "page" : undefined}
                className="aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground rounded-lg px-3 py-1.5"
              >
                {pickLocalized(item.title, locale)}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      <OutlineEditor
        key={signature}
        courseId={course.id}
        locale={locale}
        initialModules={view}
        canManage={can(actor, "content.manage")}
        canPublish={can(actor, "content.publish")}
        labels={{ content: t, lesson: dict.admin.lessonEditor }}
        common={dict.common}
        errors={dict.errors}
      />
    </div>
  );
}
