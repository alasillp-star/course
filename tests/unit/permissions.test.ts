import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, PERMISSIONS, ROLE_PERMISSIONS } from "@/modules/access/catalog";
import { SYSTEM_ROLES } from "@/shared/enums";

const has = (role: keyof typeof ROLE_PERMISSIONS, prefix: string) =>
  ROLE_PERMISSIONS[role].some((permission) => permission.startsWith(prefix));

describe("role permission matrix", () => {
  it("only references permissions from the catalogue", () => {
    for (const role of SYSTEM_ROLES) {
      for (const permission of ROLE_PERMISSIONS[role])
        expect(Object.hasOwn(PERMISSIONS, permission)).toBe(true);
    }
  });

  it("gives Super Admin everything and Admin everything except role management", () => {
    expect(ROLE_PERMISSIONS.super_admin).toEqual(ALL_PERMISSIONS);
    expect(ROLE_PERMISSIONS.admin).not.toContain("roles.manage");
    expect(ROLE_PERMISSIONS.admin.length).toBe(ALL_PERMISSIONS.length - 1);
  });

  it("keeps support agents away from sales, finance and staff management", () => {
    for (const prefix of [
      "orders.",
      "payments.",
      "refunds.",
      "finance.",
      "staff.",
      "roles.",
      "invoices.",
      "discounts.",
    ]) {
      expect(has("support_agent", prefix)).toBe(false);
    }
    expect(ROLE_PERMISSIONS.support_agent).not.toContain("activation.codes.sell");
    expect(ROLE_PERMISSIONS.support_agent).not.toContain("activation.codes.export");
  });

  it("keeps sales agents away from student PII, secrets and administration", () => {
    for (const permission of [
      "users.read",
      "users.read_sensitive",
      "activation.codes.export",
      "staff.manage",
      "finance.reports.read",
    ] as const) {
      expect(ROLE_PERMISSIONS.sales_agent).not.toContain(permission);
    }
  });

  it("limits moderators and instructors to their domains", () => {
    expect(has("moderator", "activation.")).toBe(false);
    expect(has("moderator", "orders.")).toBe(false);
    expect(has("instructor", "activation.")).toBe(false);
    expect(has("instructor", "finance.")).toBe(false);
  });

  it("gives students no administrative permission at all", () => {
    expect(ROLE_PERMISSIONS.student).toEqual(["community.participate"]);
  });

  it("restricts card secret exports to the two admin roles", () => {
    const holders = SYSTEM_ROLES.filter((role) =>
      ROLE_PERMISSIONS[role].includes("activation.codes.export"),
    );
    expect(holders.sort()).toEqual(["admin", "super_admin"]);
  });
});
