import Link from "next/link";
import { CheckCircle2Icon, LockIcon, PlayCircleIcon } from "lucide-react";
import type { LocalizedText } from "@/server/db/schema";
import type { Locale } from "@/i18n/config";
import { format, pickLocalized } from "@/i18n/format";
import { minutesOf } from "@/lib/media-format";
import { cn } from "@/lib/utils";

export type OutlineView = Array<{
  id: string;
  title: LocalizedText;
  lessons: Array<{
    id: string;
    title: LocalizedText;
    durationSeconds: number | null;
    completed: boolean;
    locked: boolean;
    current?: boolean;
  }>;
}>;

/** Modules and lessons with completion state; locked lessons are not links. */
export function CourseOutline({
  outline,
  locale,
  labels,
  compact = false,
}: {
  outline: OutlineView;
  locale: Locale;
  labels: { minutes: string; locked: string; completed: string };
  compact?: boolean;
}) {
  return (
    <ol className="grid grid-cols-1 gap-4">
      {outline.map((module, moduleIndex) => {
        const done = module.lessons.filter((lesson) => lesson.completed).length;
        return (
          <li key={module.id} className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
              <h3 className="text-sm font-semibold">
                <span className="text-muted-foreground tabular me-1.5">{moduleIndex + 1}.</span>
                {pickLocalized(module.title, locale)}
              </h3>
              <span className="text-muted-foreground tabular shrink-0 text-xs">
                {done}/{module.lessons.length}
              </span>
            </div>
            <ul className="grid grid-cols-1 gap-1">
              {module.lessons.map((lesson) => {
                const minutes = minutesOf(lesson.durationSeconds);
                const icon = lesson.completed ? (
                  <CheckCircle2Icon
                    className="text-success size-4 shrink-0"
                    aria-label={labels.completed}
                  />
                ) : lesson.locked ? (
                  <LockIcon
                    className="text-muted-foreground size-4 shrink-0"
                    aria-label={labels.locked}
                  />
                ) : (
                  <PlayCircleIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                );
                const body = (
                  <>
                    {icon}
                    <span className="min-w-0 flex-1 truncate">
                      {pickLocalized(lesson.title, locale)}
                    </span>
                    {minutes ? (
                      <span className="text-muted-foreground tabular shrink-0 text-xs">
                        {format(labels.minutes, { count: minutes })}
                      </span>
                    ) : null}
                  </>
                );
                const rowClass = cn(
                  "flex items-center gap-3 rounded-lg border border-transparent px-3 text-sm",
                  compact ? "py-2" : "py-2.5",
                  lesson.current && "border-primary/30 bg-secondary font-medium",
                );
                return (
                  <li key={lesson.id}>
                    {lesson.locked ? (
                      <span className={cn(rowClass, "text-muted-foreground cursor-not-allowed")}>
                        {body}
                      </span>
                    ) : (
                      <Link
                        href={`/${locale}/app/course/${lesson.id}`}
                        aria-current={lesson.current ? "page" : undefined}
                        className={cn(rowClass, !lesson.current && "hover:bg-muted")}
                      >
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
