import { expect, test } from "@playwright/test";

for (const [locale, dir] of [
  ["ar", "rtl"],
  ["fr", "ltr"],
] as const) {
  test(`home page (${locale}) is ${dir} and has no horizontal overflow`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("the theme can be switched to dark mode", async ({ page }) => {
  await page.goto("/fr/login");
  await page.getByRole("button", { name: "Changer le thème" }).click();
  await page.getByRole("menuitem", { name: "Sombre" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
