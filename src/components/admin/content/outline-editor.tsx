"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  GripVerticalIcon,
  PaperclipIcon,
  PencilIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ApiActionDialog } from "@/components/admin/api-action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/stat-card";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { format, pickLocalized } from "@/i18n/format";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import type { DisplayStatus } from "@/modules/content/display";
import type { LocalizedText } from "@/server/db/schema";
import type { ContentStatus, MediaStatus } from "@/shared/enums";
import { ModuleDialog, NewLessonDialog } from "./module-dialog";
import { ContentStatusBadge, VideoStatusBadge } from "./status-badges";

export type OutlineLessonView = {
  id: string;
  title: LocalizedText;
  displayStatus: DisplayStatus;
  isFreePreview: boolean;
  videoStatus: MediaStatus | "none";
  pendingVideoStatus: MediaStatus | null;
  resourceCount: number;
};

export type OutlineModuleView = {
  id: string;
  title: LocalizedText;
  description: LocalizedText | null;
  status: ContentStatus;
  publishAt: string | null;
  displayStatus: DisplayStatus;
  lessons: OutlineLessonView[];
};

type Labels = {
  content: Dictionary["admin"]["content"];
  lesson: Dictionary["admin"]["lessonEditor"];
};

function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/**
 * Course outline editor. The order is saved after every move; the server is
 * the source of truth (the page re-renders with its data after each change).
 */
export function OutlineEditor({
  courseId,
  locale,
  initialModules,
  canManage,
  canPublish,
  labels,
  common,
  errors,
}: {
  courseId: string;
  locale: Locale;
  initialModules: OutlineModuleView[];
  canManage: boolean;
  canPublish: boolean;
  labels: Labels;
  common: Dictionary["common"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const t = labels.content;
  const [modules, setModules] = useState(initialModules);
  const sensors = useDndSensors();

  async function persist(request: () => Promise<unknown>, previous: OutlineModuleView[]) {
    try {
      await request();
      toast.success(t.reordered);
      router.refresh();
    } catch (error) {
      setModules(previous);
      toast.error(errorMessage(error, errors));
    }
  }

  function reorderModules(next: OutlineModuleView[]) {
    const previous = modules;
    setModules(next);
    void persist(
      () =>
        api(`/api/v1/admin/content/courses/${courseId}/module-order`, {
          method: "PUT",
          body: { moduleIds: next.map((module) => module.id) },
        }),
      previous,
    );
  }

  function reorderLessons(moduleId: string, lessons: OutlineLessonView[]) {
    const previous = modules;
    setModules(modules.map((item) => (item.id === moduleId ? { ...item, lessons } : item)));
    void persist(
      () =>
        api(`/api/v1/admin/content/modules/${moduleId}/lesson-order`, {
          method: "PUT",
          body: { lessonIds: lessons.map((lesson) => lesson.id) },
        }),
      previous,
    );
  }

  function moveLesson(lessonId: string, fromModuleId: string, toModuleId: string) {
    const lesson = modules
      .find((item) => item.id === fromModuleId)
      ?.lessons.find((item) => item.id === lessonId);
    const target = modules.find((item) => item.id === toModuleId);
    if (!lesson || !target) return;
    const previous = modules;
    const targetLessons = [...target.lessons, lesson];
    setModules(
      modules.map((item) =>
        item.id === fromModuleId
          ? { ...item, lessons: item.lessons.filter((entry) => entry.id !== lessonId) }
          : item.id === toModuleId
            ? { ...item, lessons: targetLessons }
            : item,
      ),
    );
    void persist(
      () =>
        api(`/api/v1/admin/content/modules/${toModuleId}/lesson-order`, {
          method: "PUT",
          body: { lessonIds: targetLessons.map((entry) => entry.id) },
        }),
      previous,
    );
  }

  function onModuleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = modules.findIndex((module) => module.id === active.id);
    const to = modules.findIndex((module) => module.id === over.id);
    if (from >= 0 && to >= 0) reorderModules(arrayMove(modules, from, to));
  }

  if (modules.length === 0) {
    return (
      <EmptyState
        title={t.empty}
        action={
          canManage ? (
            <ModuleDialog
              courseId={courseId}
              canPublish={canPublish}
              trigger={t.addModule}
              labels={labels}
              common={common}
              errors={errors}
            />
          ) : null
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{canManage ? t.dragHint : null}</p>
        {canManage ? (
          <ModuleDialog
            courseId={courseId}
            canPublish={canPublish}
            trigger={t.addModule}
            labels={labels}
            common={common}
            errors={errors}
          />
        ) : null}
      </div>
      <DndContext
        id="content-modules"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onModuleDragEnd}
        accessibility={{ screenReaderInstructions: { draggable: t.dragHint } }}
      >
        <SortableContext
          items={modules.map((module) => module.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="grid grid-cols-1 gap-4">
            {modules.map((module, index) => (
              <SortableModule
                key={module.id}
                module={module}
                index={index}
                total={modules.length}
                allModules={modules}
                courseId={courseId}
                locale={locale}
                canManage={canManage}
                canPublish={canPublish}
                labels={labels}
                common={common}
                errors={errors}
                onMove={(delta) => reorderModules(arrayMove(modules, index, index + delta))}
                onReorderLessons={(lessons) => reorderLessons(module.id, lessons)}
                onMoveLesson={(lessonId, toModuleId) => moveLesson(lessonId, module.id, toModuleId)}
                sensors={sensors}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableModule({
  module,
  index,
  total,
  allModules,
  courseId,
  locale,
  canManage,
  canPublish,
  labels,
  common,
  errors,
  onMove,
  onReorderLessons,
  onMoveLesson,
  sensors,
}: {
  module: OutlineModuleView;
  index: number;
  total: number;
  allModules: OutlineModuleView[];
  courseId: string;
  locale: Locale;
  canManage: boolean;
  canPublish: boolean;
  labels: Labels;
  common: Dictionary["common"];
  errors: Dictionary["errors"];
  onMove: (delta: number) => void;
  onReorderLessons: (lessons: OutlineLessonView[]) => void;
  onMoveLesson: (lessonId: string, toModuleId: string) => void;
  sensors: ReturnType<typeof useDndSensors>;
}) {
  const t = labels.content;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module.id,
    disabled: !canManage,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  function onLessonDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = module.lessons.findIndex((lesson) => lesson.id === active.id);
    const to = module.lessons.findIndex((lesson) => lesson.id === over.id);
    if (from >= 0 && to >= 0) onReorderLessons(arrayMove(module.lessons, from, to));
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn("min-w-0", isDragging && "relative z-10 opacity-90")}
      data-testid="content-module"
    >
      <Card className="overflow-hidden">
        <div className="border-border bg-muted/40 flex flex-wrap items-start gap-3 border-b p-4">
          {canManage ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground mt-0.5 cursor-grab touch-none rounded p-1 active:cursor-grabbing"
              aria-label={t.dragHint}
              {...attributes}
              {...listeners}
            >
              <GripVerticalIcon className="size-4" />
            </button>
          ) : null}
          <span className="bg-background tabular grid size-8 shrink-0 place-items-center rounded-lg text-sm font-semibold">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{pickLocalized(module.title, locale)}</h2>
              <ContentStatusBadge status={module.displayStatus} labels={t.status} />
              <span className="text-muted-foreground text-xs">
                {format(t.lessonsCount, { count: module.lessons.length })}
              </span>
            </div>
            {module.description ? (
              <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                {pickLocalized(module.description, locale)}
              </p>
            ) : null}
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.moveUp}
                disabled={index === 0}
                onClick={() => onMove(-1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.moveDown}
                disabled={index === total - 1}
                onClick={() => onMove(1)}
              >
                <ArrowDownIcon />
              </Button>
              <ModuleDialog
                courseId={courseId}
                canPublish={canPublish}
                initial={{
                  id: module.id,
                  title: module.title,
                  description: module.description,
                  status: module.status,
                  publishAt: module.publishAt,
                }}
                trigger={
                  <>
                    <PencilIcon />
                    <span className="sr-only sm:not-sr-only">{t.editModule}</span>
                  </>
                }
                triggerVariant="ghost"
                triggerSize="sm"
                labels={labels}
                common={common}
                errors={errors}
              />
              <NewLessonDialog
                moduleId={module.id}
                labels={t}
                common={common}
                errors={errors}
                locale={locale}
              />
              {canPublish || module.status !== "published" ? (
                <ApiActionDialog
                  label={t.deleteModule}
                  title={t.deleteModule}
                  description={t.deleteModuleBody}
                  endpoint={`/api/v1/admin/content/modules/${module.id}`}
                  method="DELETE"
                  successMessage={t.deleted}
                  variant="ghost"
                  size="sm"
                  common={common}
                  errors={errors}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        {module.lessons.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">{t.emptyModule}</p>
        ) : (
          <DndContext
            id={`content-lessons-${module.id}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onLessonDragEnd}
            accessibility={{ screenReaderInstructions: { draggable: t.dragHint } }}
          >
            <SortableContext
              items={module.lessons.map((lesson) => lesson.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-border grid grid-cols-1 divide-y">
                {module.lessons.map((lesson, lessonIndex) => (
                  <SortableLesson
                    key={lesson.id}
                    lesson={lesson}
                    index={lessonIndex}
                    total={module.lessons.length}
                    moduleId={module.id}
                    allModules={allModules}
                    locale={locale}
                    canManage={canManage}
                    labels={labels}
                    onMove={(delta) =>
                      onReorderLessons(arrayMove(module.lessons, lessonIndex, lessonIndex + delta))
                    }
                    onMoveTo={(toModuleId) => onMoveLesson(lesson.id, toModuleId)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </Card>
    </li>
  );
}

function SortableLesson({
  lesson,
  index,
  total,
  moduleId,
  allModules,
  locale,
  canManage,
  labels,
  onMove,
  onMoveTo,
}: {
  lesson: OutlineLessonView;
  index: number;
  total: number;
  moduleId: string;
  allModules: OutlineModuleView[];
  locale: Locale;
  canManage: boolean;
  labels: Labels;
  onMove: (delta: number) => void;
  onMoveTo: (moduleId: string) => void;
}) {
  const t = labels.content;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lesson.id,
    disabled: !canManage,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const videoStatus = lesson.pendingVideoStatus ?? lesson.videoStatus;
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3",
        isDragging && "relative z-10 shadow-lg",
      )}
      data-testid="content-lesson"
    >
      {canManage ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-grab touch-none rounded p-1 active:cursor-grabbing"
          aria-label={t.dragHint}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" />
        </button>
      ) : null}
      <span className="text-muted-foreground tabular w-5 text-xs">{index + 1}</span>
      <Link
        href={`/${locale}/admin/content/lessons/${lesson.id}`}
        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
      >
        {pickLocalized(lesson.title, locale)}
      </Link>
      <div className="flex flex-wrap items-center gap-1.5">
        <ContentStatusBadge status={lesson.displayStatus} labels={t.status} />
        <VideoStatusBadge status={videoStatus} labels={t.video} />
        {lesson.resourceCount > 0 ? (
          <Badge variant="outline">
            <PaperclipIcon />
            {lesson.resourceCount}
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {canManage ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.moveUp}
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.moveDown}
              disabled={index === total - 1}
              onClick={() => onMove(1)}
            >
              <ArrowDownIcon />
            </Button>
            {allModules.length > 1 ? (
              <NativeSelect
                aria-label={t.moveTo}
                className="h-8 w-auto max-w-36 text-xs"
                value=""
                onChange={(event) => {
                  if (event.target.value) onMoveTo(event.target.value);
                }}
              >
                <option value="">{t.moveTo}</option>
                {allModules
                  .filter((module) => module.id !== moduleId)
                  .map((module) => (
                    <option key={module.id} value={module.id}>
                      {pickLocalized(module.title, locale)}
                    </option>
                  ))}
              </NativeSelect>
            ) : null}
          </>
        ) : null}
        <Button asChild variant="ghost" size="icon-sm" aria-label={t.preview} title={t.preview}>
          <Link href={`/${locale}/app/course/${lesson.id}`} target="_blank">
            <EyeIcon />
          </Link>
        </Button>
      </div>
    </li>
  );
}
