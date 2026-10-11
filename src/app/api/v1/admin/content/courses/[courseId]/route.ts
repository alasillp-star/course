import { getEditorOutline } from "@/modules/content/content.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** Every module and lesson of a course, any status (course editor). */
export const GET = withApi<{ courseId: string }>(async (_request, { params }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.read" });
  return ok(await getEditorOutline(actor, parseIdParam((await params).courseId)));
});
