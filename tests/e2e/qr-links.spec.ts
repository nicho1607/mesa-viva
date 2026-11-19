import { expect, test } from "@playwright/test";
import { closeE2EPool, getTable } from "./support/e2e-db";
import { loginStaff } from "./support/helpers";

test.afterAll(closeE2EPool);

test("administración permite abrir y copiar el enlace del QR, con alternativa si se bloquea el portapapeles", async ({ page }) => {
  await loginStaff(page, { email: "admin@mesaviva.co", password: "admin123" });
  const table = await getTable(1);
  await page.goto("/staff/admin/qr");
  const open = page.getByRole("link", { name: "Abrir menú de la mesa 1 en otra pestaña", exact: true });
  const href = await open.getAttribute("href");
  expect(href).toContain(`/m/${table.publicToken}`);
  const popupPromise = page.waitForEvent("popup");
  await open.click();
  const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: "Menú de la mesa 1", exact: true })).toBeVisible();
  await popup.close();

  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text: string) => { document.documentElement.dataset.copied = text; } },
  }));
  const copy = page.getByRole("button", { name: "Copiar enlace de la mesa 1", exact: true });
  await copy.click();
  await expect(page.getByText("Enlace copiado.", { exact: true })).toBeVisible();
  const expectedUrl = new URL(href!, page.url()).href;
  await expect(page.locator("html")).toHaveAttribute("data-copied", expectedUrl);

  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => { throw new Error("Permiso denegado"); } },
  }));
  await copy.click();
  await expect(page.getByRole("textbox", { name: "Enlace de la mesa 1", exact: true })).toHaveValue(expectedUrl);
});
