import { expect, test } from "@playwright/test";
import { apiActivate, loadData, readOtp } from "./support";

test.describe.configure({ mode: "serial" });

const studentEmail = `returning.${Date.now()}@example.com`;

test.describe("returning students (mobile)", () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
    await apiActivate(api, loadData().cards[3]!, studentEmail);
    await api.dispose();
  });

  test("protected pages redirect to sign-in", async ({ page }) => {
    await page.goto("/ar/app");
    await expect(page).toHaveURL(/\/ar\/login\?next=%2Far%2Fapp$/);
  });

  test("signs in with e-mail OTP only — no QR code needed", async ({ page }) => {
    await page.goto("/ar/login");
    await page.getByLabel("البريد الإلكتروني").fill(studentEmail);
    const since = Date.now();
    await page.getByRole("button", { name: /أرسل رمز الدخول/ }).click();
    await page.locator('input[autocomplete="one-time-code"]').fill(await readOtp(studentEmail, since, "otp.login"));
    await expect(page).toHaveURL(/\/ar\/app$/);
    await expect(page.getByText("وصول نشط")).toBeVisible();

    // Students are not staff: the admin area is off-limits.
    await page.goto("/ar/admin");
    await expect(page).toHaveURL(/\/ar\/forbidden$/);

    // Devices: this session is listed and "sign out everywhere" ends it.
    await page.goto("/ar/app/settings/security");
    await expect(page.getByText("هذا الجهاز")).toBeVisible();
    await page.getByRole("button", { name: "الخروج من كل الأجهزة" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "تأكيد" }).click();
    await expect(page).toHaveURL(/\/ar\/login/);
    await page.goto("/ar/app");
    await expect(page).toHaveURL(/\/ar\/login/);
  });
});
