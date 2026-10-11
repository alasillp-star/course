"use client";

import { useState } from "react";
import { ClockIcon, LockIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { format } from "@/i18n/format";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { formatClock } from "@/lib/media-format";
import { usePlayerRegistry } from "./player-context";

export type NoteView = { id: string; body: string; videoTimestampSeconds: number | null };

function sortNotes(notes: NoteView[]) {
  return [...notes].sort(
    (a, b) => (a.videoTimestampSeconds ?? Infinity) - (b.videoTimestampSeconds ?? Infinity),
  );
}

/** Private notes for one lesson, optionally anchored to a video time. */
export function LessonNotes({
  lessonId,
  initialNotes,
  hasVideo,
  labels,
  common,
  errors,
}: {
  lessonId: string;
  initialNotes: NoteView[];
  hasVideo: boolean;
  labels: Dictionary["student"]["lesson"]["notesPanel"];
  common: Dictionary["common"];
  errors: Dictionary["errors"];
}) {
  const player = usePlayerRegistry();
  const [notes, setNotes] = useState(() => sortNotes(initialNotes));
  const [text, setText] = useState("");
  const [attachTime, setAttachTime] = useState(hasVideo);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setPending(true);
    try {
      const time = attachTime ? (player?.controls.current?.getTime() ?? null) : null;
      const note = await api<NoteView>(`/api/v1/lessons/${lessonId}/notes`, {
        body: { body: text.trim(), videoTimestampSeconds: time },
      });
      setNotes((current) => sortNotes([...current, note]));
      setText("");
      toast.success(labels.added);
    } catch (error) {
      toast.error(errorMessage(error, errors));
    } finally {
      setPending(false);
    }
  }

  async function save() {
    if (!editing || !editing.body.trim()) return;
    setPending(true);
    try {
      const note = await api<NoteView>(`/api/v1/notes/${editing.id}`, {
        method: "PATCH",
        body: { body: editing.body.trim() },
      });
      setNotes((current) => current.map((item) => (item.id === note.id ? note : item)));
      setEditing(null);
    } catch (error) {
      toast.error(errorMessage(error, errors));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    try {
      await api(`/api/v1/notes/${id}`, { method: "DELETE" });
      setNotes((current) => current.filter((item) => item.id !== id));
      toast.success(labels.deleted);
    } catch (error) {
      toast.error(errorMessage(error, errors));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={add} className="grid gap-2">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={labels.placeholder}
          maxLength={10_000}
          rows={3}
          aria-label={labels.placeholder}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {hasVideo ? (
            <label className="text-muted-foreground inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={attachTime}
                onChange={(event) => setAttachTime(event.target.checked)}
                className="size-4 accent-[var(--gold-strong)]"
              />
              {labels.attachTime}
            </label>
          ) : (
            <span />
          )}
          <Button type="submit" size="sm" disabled={pending || !text.trim()}>
            {labels.add}
          </Button>
        </div>
      </form>

      <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        <LockIcon className="size-3.5" />
        {labels.private}
      </p>

      {notes.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center text-sm">
          {labels.empty}
        </p>
      ) : (
        <ul className="grid gap-2">
          {notes.map((note) => (
            <li key={note.id} className="border-border bg-card rounded-xl border p-3">
              <div className="mb-1.5 flex items-center gap-2">
                {note.videoTimestampSeconds !== null ? (
                  <button
                    type="button"
                    onClick={() => player?.controls.current?.seek(note.videoTimestampSeconds ?? 0)}
                    className="bg-gold/15 text-accent-foreground dark:text-gold hover:bg-gold/25 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                    aria-label={format(labels.jump, {
                      time: formatClock(note.videoTimestampSeconds),
                    })}
                  >
                    <ClockIcon className="size-3" />
                    <span className="tabular" dir="ltr">
                      {formatClock(note.videoTimestampSeconds)}
                    </span>
                  </button>
                ) : null}
                <div className="ms-auto flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={labels.edit}
                    onClick={() => setEditing({ id: note.id, body: note.body })}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={labels.delete}
                    disabled={pending}
                    onClick={() => void remove(note.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
              {editing?.id === note.id ? (
                <div className="grid gap-2">
                  <Textarea
                    value={editing.body}
                    onChange={(event) => setEditing({ id: note.id, body: event.target.value })}
                    rows={3}
                    maxLength={10_000}
                    aria-label={labels.edit}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(null)}
                    >
                      {common.cancel}
                    </Button>
                    <Button type="button" size="sm" disabled={pending} onClick={() => void save()}>
                      {common.save}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap" dir="auto">
                  {note.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
