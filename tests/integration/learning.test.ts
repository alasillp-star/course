import { getCourseOverview } from "@/modules/learning/dashboard.service";
import { createHmac, generateKeyPairSync, verify } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/modules/access/actor";
import {
  createLesson,
  createModule,
  getEditorOutline,
  reorderLessons,
  reorderModules,
  updateLesson,
  updateModule,
} from "@/modules/content/content.service";
import {
  completeUpload,
  handleVideoWebhook,
  removeResource,
  startFileUpload,
  startVideoUpload,
  writeLocalUpload,
} from "@/modules/content/media.service";
import {
  completeLesson,
  createNote,
  deleteNote,
  getLessonPage,
  getResourceDownloadUrl,
  issuePlayback,
  listLessonNotes,
  recordHeartbeat,
  updateNote,
} from "@/modules/learning/lesson.service";
import { closeDb, getDb } from "@/server/db/client";
import {
  auditLogs,
  courseEntitlements,
  courseProgress,
  lessonResources,
  lessons,
  mediaAssets,
  videoProgress,
} from "@/server/db/schema";
import { verifyUrlToken } from "@/server/signed-token";
import { setVideoProvider } from "@/server/video";
import { CloudflareStreamProvider } from "@/server/video/cloudflare-stream";
import { MuxProvider } from "@/server/video/mux";
import {
  actorFor,
  createCourse,
  createUser,
  expectAppError,
  resetDatabase,
  staffActor,
  testMeta,
} from "./helpers";

const FIXTURE = path.resolve(import.meta.dirname, "../fixtures/lesson-sample.webm");

let courseId: string;
let instructor: Actor;

async function grantAccess(userId: string) {
  await getDb()
    .insert(courseEntitlements)
    .values({ userId, courseId, source: "manual_grant", note: "test" });
}

async function student(email: string, entitled = true) {
  const id = await createUser(email);
  if (entitled) await grantAccess(id);
  return actorFor(id);
}

/** A published module with published lessons (positions in the given order). */
async function publishedLessons(count: number, options: { durationSeconds?: number } = {}) {
  const courseModule = await createModule(
    instructor,
    { courseId, title: { ar: "الوحدة" } },
    testMeta(),
  );
  await updateModule(instructor, courseModule.id, { status: "published" }, testMeta());
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const lesson = await createLesson(
      instructor,
      { moduleId: courseModule.id, title: { ar: `الدرس ${index + 1}`, fr: `Leçon ${index + 1}` } },
      testMeta(),
    );
    await updateLesson(
      instructor,
      lesson.id,
      { status: "published", durationSeconds: options.durationSeconds ?? null },
      testMeta(),
    );
    ids.push(lesson.id);
  }
  return { moduleId: courseModule.id, lessonIds: ids };
}

async function fixtureStream() {
  const bytes = await readFile(FIXTURE);
  return {
    size: bytes.byteLength,
    body: () => new Blob([bytes]).stream() as ReadableStream<Uint8Array>,
  };
}

function tokenFromUrl(url: string) {
  return url.split("/").pop()!;
}

/** Uploads the fixture to a lesson through the local provider, as the editor does. */
async function uploadFixtureVideo(lessonId: string) {
  const file = await fixtureStream();
  const { assetId, target } = await startVideoUpload(
    instructor,
    { lessonId, filename: "lesson.webm", sizeBytes: file.size, contentType: "video/webm" },
    testMeta(),
  );
  expect(target.protocol).toBe("put");
  await writeLocalUpload(instructor, tokenFromUrl(target.url), "video/webm", file.body());
  const asset = await completeUpload(instructor, assetId, { durationSeconds: 20 }, testMeta());
  return asset;
}

beforeEach(async () => {
  await resetDatabase();
  courseId = await createCourse();
  instructor = await staffActor("teacher@example.com", "instructor");
});

afterEach(() => {
  setVideoProvider(undefined);
});

afterAll(async () => {
  await closeDb();
});

describe("course editor", () => {
  it("lets an instructor build, order and publish modules and lessons", async () => {
    const first = await createModule(instructor, { courseId, title: { ar: "أولى" } }, testMeta());
    const second = await createModule(instructor, { courseId, title: { ar: "ثانية" } }, testMeta());
    const a = await createLesson(
      instructor,
      { moduleId: first.id, title: { ar: "أ" } },
      testMeta(),
    );
    const b = await createLesson(
      instructor,
      { moduleId: first.id, title: { ar: "ب" } },
      testMeta(),
    );
    const c = await createLesson(
      instructor,
      { moduleId: second.id, title: { ar: "ج" } },
      testMeta(),
    );

    await reorderModules(instructor, courseId, [second.id, first.id], testMeta());
    // Move "c" into the first module, between "b" and "a".
    await reorderLessons(instructor, first.id, [b.id, c.id, a.id], testMeta());
    await updateLesson(
      instructor,
      b.id,
      { body: { ar: "## مقدمة\nنص الدرس" }, status: "published" },
      testMeta(),
    );

    const { modules } = await getEditorOutline(instructor, courseId);
    expect(modules.map((courseModule) => courseModule.id)).toEqual([second.id, first.id]);
    expect(modules[1]!.lessons.map((lesson) => lesson.id)).toEqual([b.id, c.id, a.id]);
    expect(modules[0]!.lessons).toHaveLength(0);
    expect(modules[1]!.lessons[0]!.status).toBe("published");

    const actions = (await getDb().select({ action: auditLogs.action }).from(auditLogs)).map(
      (row) => row.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        "content.module_created",
        "content.lesson_created",
        "content.modules_reordered",
        "content.lessons_reordered",
        "content.publication_changed",
      ]),
    );
  });

  it("separates editing from publishing and refuses staff without content rights", async () => {
    const support = await staffActor("support@example.com", "support_agent");
    await expectAppError(getEditorOutline(support, courseId), "FORBIDDEN");
    await expectAppError(
      createModule(support, { courseId, title: { ar: "x" } }, testMeta()),
      "FORBIDDEN",
    );

    const courseModule = await createModule(
      instructor,
      { courseId, title: { ar: "و" } },
      testMeta(),
    );
    const lesson = await createLesson(
      instructor,
      { moduleId: courseModule.id, title: { ar: "د" } },
      testMeta(),
    );
    const permissions = new Set(instructor.permissions);
    permissions.delete("content.publish");
    const editor: Actor = { ...instructor, permissions };
    await updateLesson(editor, lesson.id, { title: { ar: "عنوان جديد" } }, testMeta());
    await expectAppError(
      updateLesson(editor, lesson.id, { status: "published" }, testMeta()),
      "FORBIDDEN",
    );
    await expectAppError(
      updateLesson(editor, lesson.id, { isFreePreview: true }, testMeta()),
      "FORBIDDEN",
    );
  });

  it("rejects orderings that omit items or reach into another course", async () => {
    const courseModule = await createModule(
      instructor,
      { courseId, title: { ar: "و" } },
      testMeta(),
    );
    await createModule(instructor, { courseId, title: { ar: "ز" } }, testMeta());
    await expectAppError(
      reorderModules(instructor, courseId, [courseModule.id], testMeta()),
      "INVALID_REQUEST",
    );

    const otherCourse = await createCourse("other-course");
    const foreignModule = await createModule(
      instructor,
      { courseId: otherCourse, title: { ar: "خ" } },
      testMeta(),
    );
    const foreign = await createLesson(
      instructor,
      { moduleId: foreignModule.id, title: { ar: "خ" } },
      testMeta(),
    );
    await expectAppError(
      reorderLessons(instructor, courseModule.id, [foreign.id], testMeta()),
      "INVALID_REQUEST",
    );
  });
});

describe("lesson access", () => {
  it("opens published lessons for enrolled students only", async () => {
    const { lessonIds } = await publishedLessons(2);
    const enrolled = await student("enrolled@example.com");
    const outsider = await student("outsider@example.com", false);

    const page = await getLessonPage(enrolled, lessonIds[0]!);
    expect(page.access).toEqual({ entitled: true, tracked: true, preview: false });
    expect(page.next).toBe(lessonIds[1]);
    expect(page.outline[0]!.lessons.map((lesson) => lesson.current)).toEqual([true, false]);
    await expectAppError(getLessonPage(outsider, lessonIds[0]!), "COURSE_ACCESS_REQUIRED");
    await expectAppError(issuePlayback(outsider, lessonIds[0]!), "COURSE_ACCESS_REQUIRED");
  });

  it("hides drafts and scheduled lessons from students but lets staff preview them", async () => {
    const { moduleId } = await publishedLessons(1);
    const draft = await createLesson(instructor, { moduleId, title: { ar: "مسودة" } }, testMeta());
    const scheduled = await createLesson(
      instructor,
      { moduleId, title: { ar: "لاحقًا" } },
      testMeta(),
    );
    await updateLesson(
      instructor,
      scheduled.id,
      { status: "published", publishAt: new Date(Date.now() + 86_400_000) },
      testMeta(),
    );
    const enrolled = await student("enrolled@example.com");
    await expectAppError(getLessonPage(enrolled, draft.id), "NOT_FOUND");
    await expectAppError(getLessonPage(enrolled, scheduled.id), "NOT_FOUND");

    const preview = await getLessonPage(instructor, draft.id);
    expect(preview.access.preview).toBe(true);
    expect(preview.access.tracked).toBe(false);
  });

  it("opens every lesson to paying students and the team, and none to anyone else", async () => {
    const { lessonIds } = await publishedLessons(2, { durationSeconds: 300 });
    // A legacy "free preview" flag no longer opens anything to non-paying accounts.
    await updateLesson(instructor, lessonIds[0]!, { isFreePreview: true }, testMeta());
    const visitor = await student("visitor@example.com", false);
    await expectAppError(getLessonPage(visitor, lessonIds[0]!), "COURSE_ACCESS_REQUIRED");
    await expectAppError(getLessonPage(visitor, lessonIds[1]!), "COURSE_ACCESS_REQUIRED");

    const enrolled = await student("paid@example.com");
    const page = await getLessonPage(enrolled, lessonIds[0]!);
    expect(page.access).toMatchObject({ entitled: true, tracked: true, preview: false });
    expect(page.outline[0]!.lessons.every((lesson) => !lesson.locked)).toBe(true);
    expect(page.next).toBe(lessonIds[1]);

    // The team (content.read) sees every lesson unlocked, untracked.
    const teamPage = await getLessonPage(instructor, lessonIds[0]!);
    expect(teamPage.access).toMatchObject({ entitled: false, tracked: false, preview: true });
    expect(teamPage.outline[0]!.lessons.every((lesson) => !lesson.locked)).toBe(true);
    expect(teamPage.next).toBe(lessonIds[1]);
    const overview = await getCourseOverview(instructor);
    expect(overview?.staffPreview).toBe(true);
    expect(overview?.outline.flatMap((module) => module.lessons).every((l) => !l.locked)).toBe(
      true,
    );
  });

  it("issues viewer-bound playback only once the video is ready", async () => {
    const { lessonIds } = await publishedLessons(1);
    const enrolled = await student("enrolled@example.com");
    await expectAppError(issuePlayback(enrolled, lessonIds[0]!), "VIDEO_NOT_READY");

    const asset = await uploadFixtureVideo(lessonIds[0]!);
    expect(asset.status).toBe("ready");
    expect(asset.durationSeconds).toBe(20);
    const [lesson] = await getDb().select().from(lessons).where(eq(lessons.id, lessonIds[0]!));
    expect(lesson!.videoAssetId).toBe(asset.id);
    expect(lesson!.durationSeconds).toBe(20);

    const playback = await issuePlayback(enrolled, lessonIds[0]!);
    expect(playback.type).toBe("file");
    expect(playback.watermark).toMatch(/^en\*\*\*@example\.com · [0-9a-f]{8}$/);
    const token = verifyUrlToken<{ viewerId: string }>("local-video", tokenFromUrl(playback.src));
    expect(token?.viewerId).toBe(enrolled.userId);
  });
});

describe("progress", () => {
  it("caps new coverage by elapsed time and completes at the threshold", async () => {
    const { lessonIds } = await publishedLessons(2, { durationSeconds: 600 });
    const lessonId = lessonIds[0]!;
    const enrolled = await student("enrolled@example.com");
    const claimAll = { positionSeconds: 590, playedRanges: [[0, 600]] as Array<[number, number]> };

    // First heartbeat: at most 60 s of new coverage, whatever the client claims.
    let result = await recordHeartbeat(enrolled, lessonId, claimAll);
    expect(result).toMatchObject({
      recorded: true,
      watchedSeconds: 60,
      percent: 10,
      completed: false,
    });
    // Immediately again: only the slack is available.
    result = await recordHeartbeat(enrolled, lessonId, claimAll);
    expect(result).toMatchObject({ watchedSeconds: 70, completed: false });

    // Five real minutes later, up to 2x speed: 610 s budget.
    await getDb()
      .update(videoProgress)
      .set({ lastHeartbeatAt: new Date(Date.now() - 300_000) })
      .where(eq(videoProgress.lessonId, lessonId));
    result = await recordHeartbeat(enrolled, lessonId, claimAll);
    expect(result).toMatchObject({ watchedSeconds: 600, percent: 100, completed: true });

    const [course] = await getDb()
      .select()
      .from(courseProgress)
      .where(eq(courseProgress.userId, enrolled.userId));
    expect(course).toMatchObject({ completedLessons: 1, totalLessons: 2, percentComplete: 50 });
    expect(course!.lastLessonId).toBe(lessonId);

    const page = await getLessonPage(enrolled, lessonId);
    expect(page.progress.status).toBe("completed");
    // Finished videos restart from the beginning.
    expect(page.progress.resumeAt).toBe(0);
  });

  it("restores the playback position", async () => {
    const { lessonIds } = await publishedLessons(1, { durationSeconds: 600 });
    const enrolled = await student("enrolled@example.com");
    await recordHeartbeat(enrolled, lessonIds[0]!, {
      positionSeconds: 42.7,
      playedRanges: [[0, 42]],
    });
    const page = await getLessonPage(enrolled, lessonIds[0]!);
    expect(page.progress.resumeAt).toBe(42);
    expect(page.progress.status).toBe("in_progress");
  });

  it("completes text lessons manually, but video lessons only by watching", async () => {
    const { lessonIds } = await publishedLessons(2);
    const enrolled = await student("enrolled@example.com");
    expect(await completeLesson(enrolled, lessonIds[0]!)).toEqual({ completed: true });
    await uploadFixtureVideo(lessonIds[1]!);
    await expectAppError(completeLesson(enrolled, lessonIds[1]!), "INVALID_STATE");
    const [course] = await getDb()
      .select()
      .from(courseProgress)
      .where(eq(courseProgress.userId, enrolled.userId));
    expect(course).toMatchObject({ completedLessons: 1, totalLessons: 2 });
  });
});

describe("notes", () => {
  it("keeps notes private to their author", async () => {
    const { lessonIds } = await publishedLessons(1);
    const author = await student("author@example.com");
    const other = await student("other@example.com");
    const note = await createNote(author, lessonIds[0]!, {
      body: "فكرة مهمة",
      videoTimestampSeconds: 12.9,
    });
    expect(note!.videoTimestampSeconds).toBe(12);
    expect(await listLessonNotes(other, lessonIds[0]!)).toEqual([]);
    await expectAppError(updateNote(other, note!.id, { body: "x" }), "NOT_FOUND");
    await expectAppError(deleteNote(other, note!.id), "NOT_FOUND");
    await updateNote(author, note!.id, { body: "فكرة معدّلة" });
    expect((await listLessonNotes(author, lessonIds[0]!))[0]!.body).toBe("فكرة معدّلة");
    await deleteNote(author, note!.id);
    expect(await listLessonNotes(author, lessonIds[0]!)).toEqual([]);
  });
});

describe("video provider webhooks", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const secret = "test-webhook-secret";

  function sign(body: string, key: "mux" | "cloudflare") {
    const t = Math.floor(Date.now() / 1000);
    const digest = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    return new Headers(
      key === "mux"
        ? { "mux-signature": `t=${t},v1=${digest}` }
        : { "webhook-signature": `time=${t},sig1=${digest}` },
    );
  }

  it("Mux: a signed asset.ready attaches the video; stale events never downgrade it", async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    setVideoProvider(
      new MuxProvider({
        tokenId: "id",
        tokenSecret: "secret",
        signingKeyId: "key-1",
        signingKeyPrivate: Buffer.from(pem).toString("base64"),
        webhookSecret: secret,
        corsOrigin: "http://localhost:3000",
        videoQuality: "basic",
        fetchImpl: async (input, init) => {
          calls.push({ url: String(input), body: init?.body as string | undefined });
          return Response.json({
            data: { id: "upload-1", url: "https://storage.googleapis.com/u" },
          });
        },
      }),
    );
    const { lessonIds } = await publishedLessons(1);
    const { assetId, target } = await startVideoUpload(
      instructor,
      {
        lessonId: lessonIds[0]!,
        filename: "intro.mp4",
        sizeBytes: 5_000_000,
        contentType: "video/mp4",
      },
      testMeta(),
    );
    expect(target).toEqual({ protocol: "mux-upchunk", url: "https://storage.googleapis.com/u" });
    expect(JSON.parse(calls[0]!.body!)).toMatchObject({
      new_asset_settings: { playback_policy: ["signed"], passthrough: assetId },
    });

    const ready = JSON.stringify({
      id: "evt-2",
      type: "video.asset.ready",
      data: {
        id: "asset-9",
        status: "ready",
        passthrough: assetId,
        duration: 125.4,
        playback_ids: [{ id: "pb-signed", policy: "signed" }],
        tracks: [{ type: "video", max_width: 1920, max_height: 1080 }],
      },
    });
    await expect(handleVideoWebhook("mux", ready, sign(ready, "mux"))).resolves.toMatchObject({
      handled: true,
    });
    const created = JSON.stringify({
      id: "evt-1",
      type: "video.asset.created",
      data: { id: "asset-9", status: "preparing", passthrough: assetId },
    });
    await handleVideoWebhook("mux", created, sign(created, "mux"));

    const [asset] = await getDb().select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
    expect(asset).toMatchObject({ status: "ready", playbackId: "pb-signed", durationSeconds: 125 });
    const [lesson] = await getDb().select().from(lessons).where(eq(lessons.id, lessonIds[0]!));
    expect(lesson).toMatchObject({ videoAssetId: assetId, durationSeconds: 125 });

    await expectAppError(
      handleVideoWebhook("mux", ready, new Headers({ "mux-signature": "t=1,v1=00" })),
      "WEBHOOK_SIGNATURE_INVALID",
    );

    const enrolled = await student("enrolled@example.com");
    const playback = await issuePlayback(enrolled, lessonIds[0]!);
    const url = new URL(playback.src);
    expect(url.origin + url.pathname).toBe("https://stream.mux.com/pb-signed.m3u8");
    const [header, payload, signature] = url.searchParams.get("token")!.split(".");
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature!, "base64url"),
      ),
    ).toBe(true);
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toMatchObject({
      sub: "pb-signed",
      aud: "v",
      kid: "key-1",
    });
  });

  it("Cloudflare Stream: enforces signed URLs before a video goes live", async () => {
    const calls: Array<{ method: string; url: string; body?: string }> = [];
    setVideoProvider(
      new CloudflareStreamProvider({
        accountId: "acc",
        apiToken: "token",
        customerCode: "abc123",
        signingKeyId: "key-1",
        signingKeyPem: Buffer.from(pem).toString("base64"),
        webhookSecret: secret,
        fetchImpl: async (input, init) => {
          calls.push({
            method: init?.method ?? "GET",
            url: String(input),
            body: init?.body as string,
          });
          if (String(input).includes("direct_user=true")) {
            return new Response(null, {
              status: 201,
              headers: {
                location: "https://upload.videodelivery.net/tus/one-time",
                "stream-media-id": "uid-7",
              },
            });
          }
          return Response.json({ success: true, result: {} });
        },
      }),
    );
    const { lessonIds } = await publishedLessons(1);
    const { assetId } = await startVideoUpload(
      instructor,
      {
        lessonId: lessonIds[0]!,
        filename: "intro.mp4",
        sizeBytes: 9_000_000,
        contentType: "video/mp4",
      },
      testMeta(),
    );
    const body = JSON.stringify({
      uid: "uid-7",
      readyToStream: true,
      requireSignedURLs: false,
      duration: 61.2,
      meta: { name: assetId },
      status: { state: "ready" },
    });
    await handleVideoWebhook("cloudflare_stream", body, sign(body, "cloudflare"));
    const protect = calls.find((call) => call.method === "POST" && call.url.endsWith("/uid-7"));
    expect(JSON.parse(protect!.body!)).toEqual({ uid: "uid-7", requireSignedURLs: true });
    const [asset] = await getDb().select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
    expect(asset).toMatchObject({ status: "ready", playbackId: "uid-7", durationSeconds: 61 });

    const enrolled = await student("enrolled@example.com");
    const playback = await issuePlayback(enrolled, lessonIds[0]!);
    expect(playback.src).toMatch(
      /^https:\/\/customer-abc123\.cloudflarestream\.com\/[\w-]+\.[\w-]+\.[\w-]+\/manifest\/video\.m3u8$/,
    );
  });
});

describe("file resources", () => {
  it("stores a file and serves it only to students with access", async () => {
    const { lessonIds } = await publishedLessons(1);
    const content = new TextEncoder().encode("%PDF-1.4 worksheet");
    const { assetId, target } = await startFileUpload(
      instructor,
      {
        lessonId: lessonIds[0]!,
        filename: "ورقة العمل.pdf",
        sizeBytes: content.byteLength,
        contentType: "application/pdf",
        title: { ar: "ورقة العمل" },
      },
      testMeta(),
    );
    await writeLocalUpload(
      instructor,
      tokenFromUrl(target.url),
      "application/pdf",
      new Blob([content]).stream() as ReadableStream<Uint8Array>,
    );
    expect((await completeUpload(instructor, assetId, {}, testMeta())).status).toBe("ready");
    const [resource] = await getDb()
      .select()
      .from(lessonResources)
      .where(eq(lessonResources.lessonId, lessonIds[0]!));
    expect(resource).toMatchObject({ kind: "pdf", assetId, title: { ar: "ورقة العمل" } });

    const enrolled = await student("enrolled@example.com");
    const url = await getResourceDownloadUrl(enrolled, lessonIds[0]!, resource!.id);
    const token = verifyUrlToken<{ viewerId: string; filename: string }>(
      "local-file",
      tokenFromUrl(url),
    );
    expect(token).toMatchObject({ viewerId: enrolled.userId, filename: "ورقة العمل.pdf" });
    const outsider = await student("outsider@example.com", false);
    await expectAppError(
      getResourceDownloadUrl(outsider, lessonIds[0]!, resource!.id),
      "COURSE_ACCESS_REQUIRED",
    );

    await removeResource(instructor, resource!.id, testMeta());
    const [asset] = await getDb().select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
    expect(asset!.status).toBe("deleted");
    await expect(stat(path.resolve(".data/test-storage", `files/${assetId}`))).rejects.toThrow();
  });

  it("refuses dangerous types and uploads that differ from what was authorised", async () => {
    const { lessonIds } = await publishedLessons(1);
    await expectAppError(
      startFileUpload(
        instructor,
        {
          lessonId: lessonIds[0]!,
          filename: "x.html",
          sizeBytes: 10,
          contentType: "text/html",
          title: { ar: "x" },
        },
        testMeta(),
      ),
      "UNSUPPORTED_MEDIA_TYPE",
    );
    const { target } = await startFileUpload(
      instructor,
      {
        lessonId: lessonIds[0]!,
        filename: "a.pdf",
        sizeBytes: 4,
        contentType: "application/pdf",
        title: { ar: "a" },
      },
      testMeta(),
    );
    const tooBig = new Blob([new Uint8Array(64)]).stream() as ReadableStream<Uint8Array>;
    await expectAppError(
      writeLocalUpload(instructor, tokenFromUrl(target.url), "application/pdf", tooBig),
      "UPLOAD_TOO_LARGE",
    );
    const wrongType = new Blob([new Uint8Array(4)]).stream() as ReadableStream<Uint8Array>;
    await expectAppError(
      writeLocalUpload(instructor, tokenFromUrl(target.url), "text/html", wrongType),
      "INVALID_REQUEST",
    );
    const support = await staffActor("support@example.com", "support_agent");
    await expectAppError(
      writeLocalUpload(support, tokenFromUrl(target.url), "application/pdf", wrongType),
      "FORBIDDEN",
    );
    const rows = await getDb()
      .select()
      .from(lessonResources)
      .where(and(eq(lessonResources.lessonId, lessonIds[0]!)));
    expect(rows).toHaveLength(0);
  });
});
