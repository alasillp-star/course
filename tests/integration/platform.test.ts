import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { grantManually } from "@/modules/entitlements/entitlements.service";
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationsRead,
  notifyCourseMembers,
} from "@/modules/notifications/notifications.service";
import {
  assertFeatureEnabled,
  getSetting,
  getSettings,
  updateSettings,
} from "@/modules/platform/settings.service";
import { closeDb, getDb } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import {
  actorFor,
  createCourse,
  createUser,
  expectAppError,
  resetDatabase,
  staffActor,
  testMeta,
} from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeDb();
});

describe("platform settings", () => {
  it("returns defaults, validates changes and audits them", async () => {
    expect(await getSetting("certificates.completionPercent")).toBe(100);
    const admin = await staffActor("owner@example.com", "super_admin");
    const support = await staffActor("support@example.com", "support_agent");

    await expectAppError(
      updateSettings(support, { "live.enabled": false }, testMeta()),
      "FORBIDDEN",
    );
    await expectAppError(
      updateSettings(admin, { "certificates.completionPercent": 10 }, testMeta()),
      "VALIDATION_ERROR",
    );
    await expectAppError(
      updateSettings(admin, { "unknown.key": 1 }, testMeta()),
      "VALIDATION_ERROR",
    );

    const saved = await updateSettings(
      admin,
      { "live.enabled": false, "academy.supportEmail": "help@example.com" },
      testMeta(),
    );
    expect(saved["live.enabled"]).toBe(false);
    expect((await getSettings())["academy.supportEmail"]).toBe("help@example.com");
    await expectAppError(assertFeatureEnabled("live.enabled"), "FEATURE_DISABLED");
    await assertFeatureEnabled("community.enabled");

    const [entry] = await getDb().select().from(auditLogs);
    expect(entry).toMatchObject({ action: "settings.updated", actorUserId: admin.userId });
  });
});

describe("notifications", () => {
  it("reaches students with access only, and each reads their own", async () => {
    const courseId = await createCourse();
    const admin = await staffActor("owner@example.com", "super_admin");
    const enrolledId = await createUser("enrolled@example.com");
    await createUser("outsider@example.com");
    await grantManually(
      getDb(),
      admin,
      { userId: enrolledId, courseId, note: "test grant" },
      testMeta(),
    );

    const sent = await notifyCourseMembers(getDb(), courseId, {
      type: "live.scheduled",
      data: { title: "Q&A", startsAt: new Date().toISOString() },
      link: "/app/live",
    });
    expect(sent).toBe(1);

    const enrolled = await actorFor(enrolledId);
    expect(await countUnreadNotifications(enrolled)).toBe(1);
    const [notification] = await listNotifications(enrolled);
    expect(notification).toMatchObject({ type: "live.scheduled", link: "/app/live" });
    expect(await markNotificationsRead(admin, [notification!.id])).toBe(0);
    expect(await markNotificationsRead(enrolled, "all")).toBe(1);
    expect(await countUnreadNotifications(enrolled)).toBe(0);
  });
});

describe("print operator role", () => {
  it("holds the print queue permission and nothing else", async () => {
    const operator = await staffActor("print@example.com", "print_operator");
    expect([...operator.permissions]).toEqual(["printing.queue"]);
    expect(operator.isStaff).toBe(true);
  });
});
