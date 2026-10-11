import type { Metadata } from "next";
import Link from "next/link";
import { ClockIcon, NotebookPenIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat-card";
import { pickLocalized } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { formatClock } from "@/lib/media-format";
import { requirePageActor } from "@/modules/identity/current";
import { listMyNotes } from "@/modules/learning/lesson.service";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.student.notesPage.title };
}

export default async function NotesPage() {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { next: `/${locale}/app/notes` });
  const notes = await listMyNotes(actor);
  const t = dict.student.notesPage;

  const groups = new Map<
    string,
    { title: (typeof notes)[number]["lessonTitle"]; items: typeof notes }
  >();
  for (const note of notes) {
    const group = groups.get(note.lessonId) ?? { title: note.lessonTitle, items: [] };
    group.items.push(note);
    groups.set(note.lessonId, group);
  }

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.title}</h1>
        <p className="text-muted-foreground mt-1">{t.subtitle}</p>
      </section>
      {groups.size === 0 ? (
        <EmptyState title={t.empty} icon={<NotebookPenIcon />} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {[...groups.entries()].map(([lessonId, group]) => (
            <Card key={lessonId}>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle className="min-w-0 truncate text-base">
                  {pickLocalized(group.title, locale)}
                </CardTitle>
                <Link
                  href={`/${locale}/app/course/${lessonId}`}
                  className="text-highlight shrink-0 text-sm font-semibold"
                >
                  {t.openLesson}
                </Link>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2">
                  {group.items.map((note) => (
                    <li key={note.id} className="bg-muted/60 rounded-lg p-3 text-sm">
                      {note.videoTimestampSeconds !== null ? (
                        <Link
                          href={`/${locale}/app/course/${lessonId}?t=${note.videoTimestampSeconds}`}
                          className="bg-secondary text-highlight mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                        >
                          <ClockIcon className="size-3" />
                          <span className="tabular" dir="ltr">
                            {formatClock(note.videoTimestampSeconds)}
                          </span>
                        </Link>
                      ) : null}
                      <p className="whitespace-pre-wrap" dir="auto">
                        {note.body}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
