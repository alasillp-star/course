import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { markCardsSold } from "@/modules/activation/admin-codes.service";
import { createBatch, loadPrintableCards } from "@/modules/activation/batches.service";
import { completeActivation, startActivation } from "@/modules/activation/redemption.service";
import { getOverviewMetrics } from "@/modules/reports/overview.service";
import { closeDb } from "@/server/db/client";
import {
  createCourse,
  expectAppError,
  installMemoryTransport,
  resetDatabase,
  staffActor,
  testMeta,
  type MemoryTransport,
} from "./helpers";

let mail: MemoryTransport;

beforeEach(async () => {
  await resetDatabase();
  mail = installMemoryTransport();
});

afterAll(async () => {
  await closeDb();
});

describe("admin overview metrics", () => {
  it("reports students, the card funnel and the activation rate from real data", async () => {
    const courseId = await createCourse();
    const admin = await staffActor("owner@example.com", "super_admin");
    const batch = await createBatch(
      admin,
      { name: "Metrics", courseId, quantity: 4, requiresPin: false, requiresSale: true },
      testMeta(),
    );
    const { cards } = await loadPrintableCards(admin, { batchId: batch.id, from: 1, to: 4, format: "csv" }, testMeta());
    await markCardsSold(admin, { serials: cards.slice(0, 2).map((card) => card.serial) }, testMeta());
    const started = await startActivation({ code: cards[0]!.code, email: "metric@example.com", locale: "ar", meta: testMeta() });
    await completeActivation({ challengeId: started.challengeId, otp: mail.otpFor("metric@example.com"), meta: testMeta() });

    const metrics = await getOverviewMetrics(admin);
    expect(metrics.students.total).toBe(1);
    expect(metrics.students.withAccess).toBe(1);
    expect(metrics.students.new7d).toBe(1);
    expect(metrics.activation).toMatchObject({ issued: 4, available: 2, sold: 1, activated: 1, revoked: 0 });
    expect(metrics.activation.activationRate).toBeCloseTo(0.5);
    expect(metrics.activation.activated7d).toBe(1);
    expect(metrics.community).toEqual({ posts30d: 0, comments30d: 0 });
    // Super admins see finance; the figure is 0 until orders exist.
    expect(metrics.sales).toEqual({ paidOrders: 0, revenueMinor: 0, currency: "DZD" });
  });

  it("hides finance from staff without finance permissions and refuses students", async () => {
    const instructor = await staffActor("teacher@example.com", "instructor");
    const metrics = await getOverviewMetrics(instructor);
    expect(metrics.sales).toBeNull();
    const support = await staffActor("support@example.com", "support_agent");
    await expectAppError(getOverviewMetrics(support), "FORBIDDEN");
  });
});
