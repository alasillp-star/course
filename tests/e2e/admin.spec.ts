import { expect, test } from "@playwright/test";
import { ADMIN_STATE, loadData } from "./support";

test.use({ storageState: ADMIN_STATE });
test.describe.configure({ mode: "serial" });

test.describe("administration (desktop, French)", () => {
  test("overview shows live metrics", async ({ page }) => {
    await page.goto("/fr/admin");
    await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible();
    await expect(page.getByText("Cartes émises")).toBeVisible();
    await expect(page.getByText("Taux d'activation")).toBeVisible();
  });

  test("creates a batch from the dialog", async ({ page }) => {
    await page.goto("/fr/admin/activation");
    await page.getByRole("button", { name: "Nouveau lot" }).click();
    await page.getByLabel("Nom du lot").fill("Lot créé depuis l'interface");
    await page.getByLabel("Nombre de cartes").fill("5");
    await page.getByRole("button", { name: "Générer les cartes" }).click();
    await expect(page).toHaveURL(/\/fr\/admin\/activation\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Lot créé depuis l'interface" })).toBeVisible();
    await expect(page.getByRole("link", { name: "PDF" })).toBeVisible();
  });

  test("records a point-of-sale card sale", async ({ page }) => {
    const card = loadData().cards[9]!;
    await page.goto(`/fr/admin/activation/${loadData().batchId}`);
    await page.getByRole("button", { name: "Enregistrer une vente" }).click();
    await page.getByLabel("Numéros de carte").fill(card.serial);
    await page.getByRole("dialog").getByRole("button", { name: "Enregistrer la vente" }).click();
    await expect(page.getByText("1 carte(s) marquée(s) comme vendue(s).")).toBeVisible();
  });

  test("revokes a card from its detail page", async ({ page }) => {
    const card = loadData().cards[4]!;
    await page.goto(`/fr/admin/activation/${loadData().batchId}?q=${card.serial}`);
    await page.getByRole("link", { name: card.serial }).click();
    await page.getByRole("button", { name: "Annuler la carte" }).click();
    await page.getByLabel("Motif").fill("Carte endommagée en magasin");
    await page.getByRole("dialog").getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByText("Annulée").first()).toBeVisible();
    await expect(page.getByText("Annulation")).toBeVisible();
  });

  test("the audit log records the operations", async ({ page }) => {
    await page.goto("/fr/admin/audit?action=activation.");
    await expect(page.getByText("activation.code_revoked").first()).toBeVisible();
    await expect(page.getByText("activation.batch_created").first()).toBeVisible();
  });

  test("students activated by card appear in the directory", async ({ page }) => {
    await page.goto("/fr/admin/students?access=with");
    await expect(page.getByText(/@example\.com/).first()).toBeVisible();
  });
});
