import { expect, test } from "@playwright/test";
import { ADMIN_STATE, loadData, readOtp } from "./support";

test.describe.configure({ mode: "serial" });

test.describe("QR card activation (mobile, Arabic)", () => {
  test("a valid card activates a new account with lifetime access", async ({ page }) => {
    const card = loadData().cards[0]!;
    const email = `activation.${Date.now()}@example.com`;

    await page.goto(card.url);
    // The card code travelled in the #fragment and is removed from the address bar.
    await expect(page).toHaveURL(/\/ar\/activate$/);
    await expect(page.getByText("البطاقة صالحة")).toBeVisible();

    await page.getByLabel(/الرمز السري/).fill(card.pin);
    await page.getByLabel("بريدك الإلكتروني").fill(email);
    const since = Date.now();
    await page.getByRole("button", { name: /أرسل رمز التأكيد/ }).click();
    await expect(page.getByText("أكّد بريدك الإلكتروني").first()).toBeVisible();

    await page.locator('input[autocomplete="one-time-code"]').fill(await readOtp(email, since, "otp.activation"));
    await expect(page.getByText(/تم التفعيل بنجاح/)).toBeVisible();

    await page.getByRole("button", { name: /الذهاب إلى لوحتي/ }).click();
    await expect(page).toHaveURL(/\/ar\/app\?welcome=1$/);
    await expect(page.getByText("وصول نشط")).toBeVisible();
    await expect(page.getByText("مدى الحياة")).toBeVisible();
  });

  test("the same card cannot be used a second time", async ({ page }) => {
    await page.goto(loadData().cards[0]!.url);
    await expect(page.getByText("هذه البطاقة مستعملة")).toBeVisible();
  });

  test("a revoked card is refused", async ({ page, playwright, baseURL }) => {
    const card = loadData().cards[1]!;
    const admin = await playwright.request.newContext({ baseURL, storageState: ADMIN_STATE, extraHTTPHeaders: { Origin: baseURL! } });
    const lookup = await admin.get(`/api/v1/admin/activation/codes/lookup?serial=${card.serial}`);
    const { id } = (await lookup.json()).data as { id: string };
    const revoked = await admin.post(`/api/v1/admin/activation/codes/${id}/revoke`, { data: { reason: "reported stolen" } });
    expect(revoked.status()).toBe(200);
    await admin.dispose();

    await page.goto(card.url);
    await expect(page.getByText("هذه البطاقة ملغاة")).toBeVisible();
  });

  test("an unsold card cannot be activated (point-of-sale activation)", async ({ page }) => {
    await page.goto(loadData().cards[8]!.url);
    await expect(page.getByText("البطاقة غير مفعّلة للبيع بعد")).toBeVisible();
  });

  test("a wrong PIN is rejected with the remaining attempts", async ({ page }) => {
    const card = loadData().cards[2]!;
    await page.goto(card.url);
    await page.getByLabel(/الرمز السري/).fill(card.pin === "00000000" ? "11111111" : "00000000");
    await page.getByLabel("بريدك الإلكتروني").fill(`pin.${Date.now()}@example.com`);
    await page.getByRole("button", { name: /أرسل رمز التأكيد/ }).click();
    await expect(page.getByText(/الرمز السري غير صحيح\. المحاولات المتبقية: 9/)).toBeVisible();
  });

  test("the code can be typed manually when the QR code cannot be scanned", async ({ page }) => {
    const card = loadData().cards[5]!;
    await page.goto("/ar/activate");
    await page.getByLabel("رمز البطاقة").fill(card.code.toLowerCase().replace(/(.{4})(?!$)/g, "$1-"));
    await page.getByRole("button", { name: "تحقق من البطاقة" }).click();
    await expect(page.getByText("البطاقة صالحة")).toBeVisible();
  });
});
