import { expect, test, type APIRequestContext } from "@playwright/test";
import { ADMIN_STATE, apiActivate, apiLogin, loadData, totp } from "./support";

test.describe.configure({ mode: "serial" });

let student: APIRequestContext;

test.beforeAll(async ({ playwright, baseURL }) => {
  student = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL! },
  });
  await apiActivate(student, loadData().cards[6]!, `api.student.${Date.now()}@example.com`);
});

test.afterAll(async () => {
  await student.dispose();
});

test.describe("API authorisation", () => {
  test("unauthenticated requests are rejected", async ({ request }) => {
    expect((await request.get("/api/v1/me")).status()).toBe(401);
    expect((await request.get("/api/v1/admin/activation/batches")).status()).toBe(401);
    expect((await request.get("/api/v1/admin/users")).status()).toBe(401);
  });

  test("a student cannot use any admin API", async () => {
    const { batchId, courseId } = loadData();
    const attempts = [
      student.get("/api/v1/admin/activation/batches"),
      student.post("/api/v1/admin/activation/batches", {
        data: { name: "x", courseId, quantity: 1 },
      }),
      student.get(`/api/v1/admin/activation/batches/${batchId}/printer-data?from=1&to=10`),
      student.post("/api/v1/admin/activation/codes/sell", {
        data: { serials: [loadData().cards[7]!.serial] },
      }),
      student.get("/api/v1/admin/users"),
      student.post("/api/v1/admin/staff/roles", {
        data: { email: "x@example.com", roleKey: "admin" },
      }),
      student.get("/api/v1/admin/audit"),
    ];
    for (const response of await Promise.all(attempts)) {
      expect(response.status()).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    }
    // The student's own data is available.
    const me = await student.get("/api/v1/me");
    expect(me.status()).toBe(200);
    expect((await me.json()).data.entitlements[0].status).toBe("active");
  });

  test("support agents need MFA and cannot touch sales or staff", async ({
    playwright,
    baseURL,
  }) => {
    const admin = await playwright.request.newContext({
      baseURL,
      storageState: ADMIN_STATE,
      extraHTTPHeaders: { Origin: baseURL! },
    });
    const supportEmail = `support.${Date.now()}@e2e.test`;
    const granted = await admin.post("/api/v1/admin/staff/roles", {
      data: { email: supportEmail, roleKey: "support_agent" },
    });
    expect(granted.status(), await granted.text()).toBe(200);
    await admin.dispose();

    const support = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: baseURL! },
    });
    await apiLogin(support, supportEmail);
    const beforeMfa = await support.get("/api/v1/admin/users");
    expect(beforeMfa.status()).toBe(401);
    expect((await beforeMfa.json()).error.code).toBe("MFA_REQUIRED");

    const { secret } = (
      await (await support.post("/api/v1/auth/mfa/totp/enroll", { data: {} })).json()
    ).data;
    expect(
      (
        await support.post("/api/v1/auth/mfa/totp/confirm", { data: { code: totp(secret) } })
      ).status(),
    ).toBe(200);

    expect((await support.get("/api/v1/admin/users")).status()).toBe(200);
    const sell = await support.post("/api/v1/admin/activation/codes/sell", {
      data: { serials: [loadData().cards[7]!.serial] },
    });
    expect(sell.status()).toBe(403);
    const promote = await support.post("/api/v1/admin/staff/roles", {
      data: { email: supportEmail, roleKey: "admin" },
    });
    expect(promote.status()).toBe(403);
    const exportSecrets = await support.get(
      `/api/v1/admin/activation/batches/${loadData().batchId}/cards-pdf?from=1&to=2`,
    );
    expect(exportSecrets.status()).toBe(403);
    await support.dispose();
  });

  test("cross-site and origin-less state changes are rejected (CSRF)", async ({
    playwright,
    baseURL,
  }) => {
    const evil = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: "https://evil.example" },
    });
    const crossSite = await evil.post("/api/v1/auth/otp/request", {
      data: { email: "victim@example.com" },
    });
    expect(crossSite.status()).toBe(403);
    expect((await crossSite.json()).error.code).toBe("CSRF_REJECTED");
    await evil.dispose();

    const bare = await playwright.request.newContext({ baseURL });
    expect((await bare.post("/api/v1/activation/check", { data: { code: "x" } })).status()).toBe(
      403,
    );
    await bare.dispose();
  });

  test("OTP requests are rate limited per address", async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: baseURL! },
    });
    const email = `flood.${Date.now()}@example.com`;
    for (let i = 0; i < 5; i += 1) {
      expect((await api.post("/api/v1/auth/otp/request", { data: { email } })).status()).toBe(200);
    }
    const limited = await api.post("/api/v1/auth/otp/request", { data: { email } });
    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
    await api.dispose();
  });
});

test.describe("transport security", () => {
  test("HTML responses carry a strict nonce-based CSP and hardening headers", async ({
    request,
  }) => {
    const response = await request.get("/fr");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
    );
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-powered-by"]).toBeUndefined();
    const activation = await request.get("/ar/activate");
    expect(activation.headers()["referrer-policy"]).toBe("no-referrer");
  });

  test("API responses are never cached and cannot render HTML", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["content-security-policy"]).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });

  test("the session cookie is HttpOnly and SameSite=Lax", async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: baseURL! },
    });
    await apiLogin(api, loadData().adminEmail);
    const cookie = (await api.storageState()).cookies.find((entry) =>
      entry.name.includes("academy_session"),
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/");
    await api.dispose();
  });
});
