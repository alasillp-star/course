import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { markCardsSold, revokeCard } from "@/modules/activation/admin-codes.service";
import { createBatch, listBatches, loadPrintableCards } from "@/modules/activation/batches.service";
import { grantRole, loadUserAccess, revokeRole } from "@/modules/access/rbac.service";
import { grantManually } from "@/modules/entitlements/entitlements.service";
import { closeDb, getDb } from "@/server/db/client";
import {
  actorFor,
  createCourse,
  createUser,
  expectAppError,
  resetDatabase,
  staffActor,
  testMeta,
} from "./helpers";

let courseId: string;

beforeEach(async () => {
  await resetDatabase();
  courseId = await createCourse();
});

afterAll(async () => {
  await closeDb();
});

const batchInput = () => ({ name: "B", courseId, quantity: 2, requiresPin: true, requiresSale: true });

describe("permission enforcement in services (not only in the UI)", () => {
  it("students cannot use any admin capability", async () => {
    const student = await actorFor(await createUser("student@example.com"));
    expect([...student.permissions]).toEqual(["community.participate"]);
    await expectAppError(createBatch(student, batchInput(), testMeta()), "FORBIDDEN");
    await expectAppError(listBatches(student), "FORBIDDEN");
    await expectAppError(markCardsSold(student, { serials: ["B0001-00001"] }, testMeta()), "FORBIDDEN");
  });

  it("support agents cannot sell cards, change sales or manage staff", async () => {
    const support = await staffActor("support@example.com", "support_agent");
    const target = await createUser("someone@example.com");
    await expectAppError(markCardsSold(support, { serials: ["B0001-00001"] }, testMeta()), "FORBIDDEN");
    await expectAppError(createBatch(support, batchInput(), testMeta()), "FORBIDDEN");
    await expectAppError(grantRole(getDb(), support, { userId: target, roleKey: "admin" }, testMeta()), "FORBIDDEN");
    await expectAppError(
      grantManually(getDb(), support, { userId: target, courseId, note: "x" }, testMeta()),
      "FORBIDDEN",
    );
    expect(support.permissions.has("orders.manage")).toBe(false);
    expect(support.permissions.has("finance.reports.read")).toBe(false);
  });

  it("sales agents can sell but cannot export secrets, revoke cards or read student PII", async () => {
    const admin = await staffActor("admin@example.com", "super_admin");
    const sales = await staffActor("sales@example.com", "sales_agent");
    const batch = await createBatch(admin, batchInput(), testMeta());
    const result = await markCardsSold(sales, { serials: ["B0001-00001", "B0001-99999"] }, testMeta());
    expect(result.sold).toEqual(["B0001-00001"]);
    expect(result.skipped).toEqual([{ serial: "B0001-99999", reason: "NOT_FOUND" }]);

    await expectAppError(
      loadPrintableCards(sales, { batchId: batch.id, from: 1, to: 2, format: "pdf" }, testMeta()),
      "FORBIDDEN",
    );
    await expectAppError(revokeCard(sales, { codeId: batch.id, reason: "x" }, testMeta()), "FORBIDDEN");
    expect(sales.permissions.has("users.read")).toBe(false);
  });

  it("admins cannot grant Super Admin; nobody can change their own roles", async () => {
    const admin = await staffActor("admin@example.com", "admin");
    const target = await createUser("promote@example.com");
    await expectAppError(grantRole(getDb(), admin, { userId: target, roleKey: "super_admin" }, testMeta()), "FORBIDDEN");
    await expectAppError(grantRole(getDb(), admin, { userId: admin.userId, roleKey: "instructor" }, testMeta()), "FORBIDDEN");
    await grantRole(getDb(), admin, { userId: target, roleKey: "instructor" }, testMeta());
    const access = await loadUserAccess(getDb(), target);
    expect(access.roles).toContain("instructor");
    expect(access.permissions.has("content.manage")).toBe(true);
  });

  it("the last Super Admin cannot be removed", async () => {
    const owner = await staffActor("owner@example.com", "super_admin");
    const second = await staffActor("second@example.com", "super_admin");
    await revokeRole(getDb(), owner, { userId: second.userId, roleKey: "super_admin" }, testMeta());
    const third = await staffActor("third@example.com", "super_admin");
    await revokeRole(getDb(), third, { userId: owner.userId, roleKey: "super_admin" }, testMeta());
    // `third` is now the only Super Admin and cannot be demoted by anyone.
    const admin = await staffActor("admin@example.com", "admin");
    await expectAppError(
      revokeRole(getDb(), admin, { userId: third.userId, roleKey: "super_admin" }, testMeta()),
      "FORBIDDEN",
    );
  });
});
