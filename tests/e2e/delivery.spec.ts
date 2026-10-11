import { expect, test } from "@playwright/test";
import { ADMIN_STATE, DELIVERY_TOKEN, loadData, ORDERS_TOKEN, readOtp } from "./support";

test.use({ storageState: ADMIN_STATE });
test.describe.configure({ mode: "serial" });

test.describe("delivery-gated QR cards (landing page -> parcel -> carrier)", () => {
  test("integration endpoints refuse calls without their own token", async ({
    playwright,
    baseURL,
  }) => {
    const api = await playwright.request.newContext({ baseURL });
    const order = { order_id: "e2e-denied", full_name: "Nobody", total: 4900 };
    const attempts: Array<Record<string, string>> = [
      {},
      { Authorization: "Bearer wrong-token" },
      { Authorization: `Bearer ${DELIVERY_TOKEN}` },
    ];
    for (const headers of attempts) {
      const response = await api.post("/api/v1/integrations/orders", { headers, data: order });
      expect(response.status()).toBe(401);
    }
    const delivery = await api.post("/api/v1/integrations/delivery", {
      headers: { Authorization: `Bearer ${ORDERS_TOKEN}` },
      data: { tracking: "X", status: "Livré" },
    });
    expect(delivery.status()).toBe(401);
    await api.dispose();
  });

  test("a packed card unlocks only when the carrier reports the parcel delivered", async ({
    page,
    browser,
    playwright,
    baseURL,
  }) => {
    const card = loadData().qrCards[0]!;
    const reference = `e2e-${Date.now()}`;
    const integration = await playwright.request.newContext({ baseURL });

    // 1. The landing page forwards the customer's order.
    const created = await integration.post("/api/v1/integrations/orders", {
      headers: { Authorization: `Bearer ${ORDERS_TOKEN}` },
      data: {
        order_id: reference,
        full_name: "Client Livraison",
        phone: "+213 555 00 11 22",
        wilaya: "16 - Alger",
        commune: "Hydra",
        total: "4 900",
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { orderNumber } = (await created.json()).data as { orderNumber: string };

    // 2. Staff pack a printed card into the parcel and record the tracking number.
    await page.goto("/fr/admin/orders?stage=needs_card");
    await page.getByRole("link", { name: orderNumber }).click();
    await page.getByLabel("N° de carte").fill(card.serial.toLowerCase());
    await page.getByRole("button", { name: "Glisser dans le colis" }).click();
    await expect(page.getByText(`Carte ${card.serial} ajoutée.`)).toBeVisible();
    await expect(page.getByText("Verrouillée jusqu'à la livraison", { exact: true })).toBeVisible();
    await page.getByLabel("Transporteur").fill("Yalidine");
    await page.getByLabel("N° de suivi").fill(`yal-${reference}`);
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByText("Informations d'expédition enregistrées.")).toBeVisible();

    // 3. The customer scans the card before delivery: refused, with a clear message.
    const student = await browser.newContext({ locale: "ar", storageState: undefined });
    const phone = await student.newPage();
    await phone.goto(card.url);
    await expect(phone.getByText("بانتظار تأكيد تسليم الطرد")).toBeVisible();

    // 4. Carrier updates: out for delivery (still locked), then delivered.
    const carrier = (status: string) =>
      integration.post("/api/v1/integrations/delivery", {
        headers: { Authorization: `Bearer ${DELIVERY_TOKEN}` },
        data: { tracking: `YAL-${reference}`, status },
      });
    const outForDelivery = await carrier("En cours de livraison");
    expect((await outForDelivery.json()).data.results[0].status).toBe("out_for_delivery");
    await phone.getByRole("button", { name: "إعادة المحاولة" }).click();
    await expect(phone.getByText("بانتظار تأكيد تسليم الطرد")).toBeVisible();

    const delivered = await carrier("Livré");
    expect((await delivered.json()).data.results[0]).toMatchObject({
      outcome: "delivered",
      cardsUnlocked: 1,
    });

    // 5. Same page, retry: the QR-only card now activates (no PIN step).
    await phone.getByRole("button", { name: "إعادة المحاولة" }).click();
    await expect(phone.getByText("البطاقة صالحة")).toBeVisible();
    await expect(phone.getByLabel(/الرمز السري/)).toHaveCount(0);
    const email = `delivery.${Date.now()}@example.com`;
    await phone.getByLabel("بريدك الإلكتروني").fill(email);
    const since = Date.now();
    await phone.getByRole("button", { name: /أرسل رمز التأكيد/ }).click();
    await phone
      .locator('input[autocomplete="one-time-code"]')
      .fill(await readOtp(email, since, "otp.activation"));
    await expect(phone.getByText(/تم التفعيل بنجاح/)).toBeVisible();

    // 6. The order is paid (cash on delivery) and the card shows as activated.
    await page.reload();
    await expect(page.getByText("Payée").first()).toBeVisible();
    await expect(page.getByText("Paiement à la livraison")).toBeVisible();
    await expect(page.getByText("Activée").first()).toBeVisible();

    await student.close();
    await integration.dispose();
  });
});
