import { expect, test as setup } from "@playwright/test";
import { ADMIN_STATE, apiLogin, parseCsv, saveData, totp, type Card } from "./support";

/**
 * Bootstraps the E2E world through the public API only:
 * the seeded Super Admin signs in with an e-mailed OTP, enrols TOTP MFA,
 * creates a card batch, downloads the printer file and sells 8 of 12 cards.
 */
setup("admin signs in, enrols MFA and prepares activation cards", async ({ playwright, baseURL }) => {
  const adminEmail = "owner@e2e.test";
  const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });

  const login = await apiLogin(api, adminEmail);
  expect(login.isStaff).toBe(true);

  // Admin APIs are refused until the second factor is completed.
  const blocked = await api.get("/api/v1/admin/activation/batches");
  expect(blocked.status()).toBe(401);
  expect((await blocked.json()).error.code).toBe("MFA_REQUIRED");

  const enroll = await api.post("/api/v1/auth/mfa/totp/enroll", { data: {} });
  expect(enroll.status()).toBe(200);
  const { secret } = (await enroll.json()).data as { secret: string };
  const confirm = await api.post("/api/v1/auth/mfa/totp/confirm", { data: { code: totp(secret) } });
  expect(confirm.status(), await confirm.text()).toBe(200);
  expect(((await confirm.json()).data.recoveryCodes as string[]).length).toBe(10);

  const courses = await api.get("/api/v1/admin/courses");
  expect(courses.status()).toBe(200);
  const courseId = ((await courses.json()).data as Array<{ id: string }>)[0]!.id;

  const created = await api.post("/api/v1/admin/activation/batches", {
    data: { name: "E2E batch", courseId, quantity: 12, requiresPin: true, requiresSale: true },
  });
  expect(created.status(), await created.text()).toBe(201);
  const batch = (await created.json()).data as { id: string };

  const printer = await api.get(`/api/v1/admin/activation/batches/${batch.id}/printer-data?from=1&to=12`);
  expect(printer.status()).toBe(200);
  expect(printer.headers()["content-type"]).toContain("text/csv");
  const rows = parseCsv(await printer.text()).slice(1);
  const cards: Card[] = rows.map(([serial, code, pin, url]) => ({
    serial: serial!,
    code: code!.replaceAll("-", ""),
    pin: pin!.replace(" ", ""),
    url: url!,
    sold: false,
  }));
  expect(cards).toHaveLength(12);

  const sold = await api.post("/api/v1/admin/activation/codes/sell", { data: { serials: cards.slice(0, 8).map((card) => card.serial) } });
  expect(sold.status()).toBe(200);
  expect((await sold.json()).data.sold).toHaveLength(8);
  cards.slice(0, 8).forEach((card) => (card.sold = true));

  saveData({ adminEmail, adminSecret: secret, batchId: batch.id, courseId, cards });
  await api.storageState({ path: ADMIN_STATE });
  await api.dispose();
});
