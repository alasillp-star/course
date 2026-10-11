import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowRightIcon, EyeIcon } from "lucide-react";
import { ApiActionDialog } from "@/components/admin/api-action-dialog";
import { LessonForm } from "@/components/admin/content/lesson-form";
import { PageHeader } from "@/components/admin/page-header";
import { ResourcesEditor } from "@/components/admin/content/resources-editor";
import { ContentStatusBadge } from "@/components/admin/content/status-badges";
import { VideoUploader } from "@/components/admin/content/video-uploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Locale } from "@/i18n/config";
import { pickLocalized } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { can } from "@/modules/access/actor";
import { getEditorLesson } from "@/modules/content/content.service";
import { displayStatus } from "@/modules/content/display";
import { requirePageActor } from "@/modules/identity/current";
import { getEnv } from "@/server/env";
import { isAppError } from "@/server/http/errors";
import { uuidSchema } from "@/server/http/schemas";

const loadLesson = cache(async (locale: Locale, lessonId: string) => {
  if (!uuidSchema.safeParse(lessonId).success) notFound();
  const actor = await requirePageActor(locale, {
    adminArea: true,
    permission: "content.read",
    next: `/${locale}/admin/content/lessons/${lessonId}`,
  });
  try {
    return { actor, data: await getEditorLesson(actor, lessonId) };
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
});

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/content/lessons/[lessonId]">): Promise<Metadata> {
  const { locale } = await getI18n();
  const { data } = await loadLesson(locale, (await params).lessonId);
  return { title: pickLocalized(data.lesson.title, locale) };
}

export default async function LessonEditorPage({
  params,
}: PageProps<"/[locale]/admin/content/lessons/[lessonId]">) {
  const { locale, dict } = await getI18n();
  const { actor, data } = await loadLesson(locale, (await params).lessonId);
  const t = dict.admin.lessonEditor;
  const { lesson } = data;
  const canManage = can(actor, "content.manage");
  const canPublish = can(actor, "content.publish");
  const canMedia = can(actor, "media.manage");
  const env = getEnv();

  return (
    <div>
      <PageHeader
        back={
          <Link
            href={`/${locale}/admin/content`}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowRightIcon className="size-4 ltr:rotate-180" />
            {t.back}
          </Link>
        }
        title={pickLocalized(lesson.title, locale)}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {t.module}: {pickLocalized(data.module.title, locale)}
            <ContentStatusBadge
              status={displayStatus(lesson.status, lesson.publishAt)}
              labels={dict.admin.content.status}
            />
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/${locale}/app/course/${lesson.id}`} target="_blank">
                <EyeIcon />
                {dict.admin.content.preview}
              </Link>
            </Button>
            {canManage && (canPublish || lesson.status !== "published") ? (
              <ApiActionDialog
                label={t.deleteLesson}
                title={t.deleteLesson}
                description={t.deleteLessonBody}
                endpoint={`/api/v1/admin/content/lessons/${lesson.id}`}
                method="DELETE"
                successMessage={dict.admin.content.deleted}
                redirectTo={`/${locale}/admin/content`}
                variant="ghost"
                size="sm"
                common={dict.common}
                errors={dict.errors}
              />
            ) : null}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          {canManage ? (
            <LessonForm
              lesson={{
                id: lesson.id,
                title: lesson.title,
                summary: lesson.summary,
                body: lesson.body,
                status: lesson.status,
                publishAt: lesson.publishAt?.toISOString() ?? null,
                isFreePreview: lesson.isFreePreview,
                completionThresholdPercent: lesson.completionThresholdPercent,
                durationSeconds: lesson.durationSeconds,
                hasVideo: !!lesson.videoAssetId,
              }}
              canPublish={canPublish}
              labels={t}
              contentLabels={dict.admin.content}
              errors={dict.errors}
            />
          ) : (
            <p className="text-muted-foreground text-sm">{dict.errors.FORBIDDEN}</p>
          )}
        </div>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.video.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {canMedia ? (
                <VideoUploader
                  lessonId={lesson.id}
                  current={
                    data.video
                      ? {
                          status: data.video.status,
                          durationSeconds: data.video.durationSeconds,
                          filename: data.video.originalFilename,
                        }
                      : null
                  }
                  pending={
                    data.pendingVideo
                      ? {
                          id: data.pendingVideo.assetId,
                          status: data.pendingVideo.status,
                          failureReason: data.pendingVideo.failureReason,
                        }
                      : null
                  }
                  providerConfigured={env.VIDEO_PROVIDER !== "none"}
                  maxMb={env.MAX_UPLOAD_VIDEO_MB}
                  canRemove={canPublish}
                  labels={t.video}
                  common={dict.common}
                  errors={dict.errors}
                />
              ) : (
                <p className="text-muted-foreground text-sm">{dict.errors.FORBIDDEN}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t.resources.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {canManage ? (
                <ResourcesEditor
                  lessonId={lesson.id}
                  resources={data.resources.map((resource) => ({
                    id: resource.id,
                    kind: resource.kind,
                    title: resource.title,
                    url: resource.url,
                    filename: resource.filename,
                    sizeBytes: resource.sizeBytes,
                  }))}
                  storageConfigured={env.STORAGE_PROVIDER !== "none" && canMedia}
                  maxMb={env.MAX_UPLOAD_FILE_MB}
                  locale={locale}
                  labels={t.resources}
                  titleLabels={{ ar: dict.admin.content.titleAr, fr: dict.admin.content.titleFr }}
                  common={dict.common}
                  errors={dict.errors}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
