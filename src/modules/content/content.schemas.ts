import { z } from "zod";
import { CONTENT_STATUSES } from "@/shared/enums";
import { localizedTextSchema, nullableDateTimeSchema, uuidSchema } from "@/server/http/schemas";

/** Request bodies of the content and learning APIs. */

const title = localizedTextSchema(200, { required: true });
const longText = localizedTextSchema(2000);
const body = localizedTextSchema(50_000);

const publication = {
  status: z.enum(CONTENT_STATUSES).optional(),
  publishAt: nullableDateTimeSchema.optional(),
};

export const createModuleBody = z.object({
  courseId: uuidSchema,
  title,
  description: longText.optional(),
});

export const updateModuleBody = z
  .object({ title: title.optional(), description: longText.nullable().optional(), ...publication })
  .strict();

export const createLessonBody = z.object({ moduleId: uuidSchema, title });

export const updateLessonBody = z
  .object({
    title: title.optional(),
    summary: longText.nullable().optional(),
    body: body.nullable().optional(),
    isFreePreview: z.boolean().optional(),
    completionThresholdPercent: z.number().int().min(1).max(100).optional(),
    durationSeconds: z.number().int().min(0).max(86_400).nullable().optional(),
    ...publication,
  })
  .strict();

const idList = z.array(uuidSchema).max(500);
export const moduleOrderBody = z.object({ moduleIds: idList });
export const lessonOrderBody = z.object({ lessonIds: idList });
export const resourceOrderBody = z.object({ resourceIds: idList });

const httpsUrl = z.url({ protocol: /^https$/, error: "Only https:// links are allowed" }).max(2000);

export const addResourceBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("link"), title, url: httpsUrl }),
  z.object({
    kind: z.literal("file"),
    title,
    filename: z.string().trim().min(1).max(255),
    sizeBytes: z.number().int().min(1),
    contentType: z.string().trim().min(3).max(150),
  }),
]);

export const updateResourceBody = z
  .object({ title: title.optional(), url: httpsUrl.optional() })
  .strict();

export const startVideoUploadBody = z.object({
  lessonId: uuidSchema,
  filename: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().min(1),
  contentType: z.string().trim().min(3).max(150),
});

export const completeUploadBody = z.object({
  durationSeconds: z.number().min(0).max(86_400).optional(),
});

export const heartbeatBody = z.object({
  positionSeconds: z.number().min(0).max(86_400),
  playedRanges: z
    .array(z.tuple([z.number().min(0).max(86_400), z.number().min(0).max(86_400)]))
    .max(200),
});

export const noteBody = z.object({
  body: z.string().trim().min(1).max(10_000),
  videoTimestampSeconds: z.number().min(0).max(86_400).nullable().optional(),
});

export const updateNoteBody = z.object({ body: z.string().trim().min(1).max(10_000) });
