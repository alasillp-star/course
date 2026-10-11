import { updateNoteBody } from "@/modules/content/content.schemas";
import { requireApiActor } from "@/modules/identity/current";
import { deleteNote, updateNote } from "@/modules/learning/lesson.service";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** Only the author can change or delete a note. */
export const PATCH = withApi<{ noteId: string }>(async (request, { params }) => {
  const actor = await requireApiActor();
  const input = await parseJsonBody(request, updateNoteBody);
  return ok(await updateNote(actor, parseIdParam((await params).noteId), input));
});

export const DELETE = withApi<{ noteId: string }>(async (_request, { params }) => {
  const actor = await requireApiActor();
  await deleteNote(actor, parseIdParam((await params).noteId));
  return ok({ deleted: true });
});
