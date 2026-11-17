import { expect, test } from "@playwright/test";
import { closeE2EPool, e2eQuery } from "./support/e2e-db";
import { cop, LAURA, loginStaff } from "./support/helpers";

const salesPath = "/staff/admin/ventas";

test.afterAll(closeE2EPool);

test("Administración filtra las cuentas por fecha de cierre en Bogotá", async ({ page }) => {
  await e2eQuery(`
    WITH fixtures(mesa, cierre, total) AS (
      VALUES (1, timestamp '2025-05-10 04:59:59.999', 9900000),
             (2, timestamp '2025-05-10 05:00:00.000', 1000000),
             (3, timestamp '2025-05-11 04:59:59.999', 2500000),
             (4, timestamp '2025-05-11 05:00:00.000', 9900000)
    ), orders AS (
      INSERT INTO "Order" (id, "tableId", status, "closedAt")
      SELECT gen_random_uuid(), t.id, 'CLOSED', f.cierre
      FROM fixtures f JOIN "Table" t ON t.number = f.mesa
      RETURNING id, "closedAt"
    )
    INSERT INTO "Bill" (id, "orderId", subtotal, "taxRate", "taxAmount",
                        "tipRate", "tipAmount", total, lines, "closedById")
    SELECT gen_random_uuid(), o.id, f.total, 0, 0, 0, 0, f.total, '[]', u.id
    FROM orders o JOIN fixtures f ON f.cierre = o."closedAt"
    CROSS JOIN "User" u WHERE u.email = 'admin@mesaviva.co'
  `);
  await loginStaff(page, { email: "admin@mesaviva.co", password: process.env.SEED_ADMIN_PASSWORD ?? "admin123" });
  await page.getByRole("link", { name: "Administración" }).click();
  await page.getByRole("link", { name: "Ventas" }).click();
  const from = page.getByLabel("Desde");
  const to = page.getByLabel("Hasta");
  const today = await from.inputValue();
  await expect(to).toHaveValue(today);

  await from.fill("2025-05-10");
  await to.fill("2025-05-10");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody tr").nth(0).getByRole("cell", { name: "3", exact: true })).toBeVisible();
  await expect(page.locator("tbody tr").nth(1).getByRole("cell", { name: "2", exact: true })).toBeVisible();
  await expect(page.locator("dd").filter({ hasText: cop(3500000) })).toBeVisible();

  await page.goto(`${salesPath}?desde=2025-05-08&hasta=2025-05-08`);
  await expect(page.getByText("No hay ventas en este rango.")).toBeVisible();
  await page.goto(`${salesPath}?desde=2025-05-11&hasta=2025-05-10`);
  await expect(page.getByRole("alert").filter({ hasText: "Ingresa dos fechas válidas" })).toBeVisible();
  await page.getByRole("link", { name: "Volver a hoy" }).click();
  await expect(from).toHaveValue(today);
  await expect(to).toHaveValue(today);
});

test("un mesero no puede consultar ventas", async ({ page }) => {
  await loginStaff(page, LAURA);
  await page.goto(salesPath);
  await expect(page).toHaveURL(/\/staff$/);
});
