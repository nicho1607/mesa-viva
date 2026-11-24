import { expect, test } from "@playwright/test";
import { closeE2EPool, e2eQuery } from "./support/e2e-db";
import { cop, LAURA, loginStaff } from "./support/helpers";

let tableId = "", categoryId = "", productId = "", orderId = "";
test.beforeAll(async () => {
  [categoryId] = (await e2eQuery<{ id: string }>(`INSERT INTO "Category" (id, name) VALUES (gen_random_uuid(), 'Propina E2E') RETURNING id`)).map((r) => r.id);
  [productId] = (await e2eQuery<{ id: string }>(`INSERT INTO "Product" (id, name, price, "categoryId") VALUES (gen_random_uuid(), 'Cobro E2E', 10000000, $1) RETURNING id`, [categoryId])).map((r) => r.id);
  [tableId] = (await e2eQuery<{ id: string }>(`INSERT INTO "Table" (id, number, "zoneId", "publicToken", status)
    SELECT gen_random_uuid(), 987653, z.id, 'payment-closing-e2e-token', 'OCCUPIED'
    FROM "Zone" z JOIN "User" u ON u.id = z."waiterId" WHERE u.email = $1 LIMIT 1 RETURNING id`, [LAURA.email])).map((r) => r.id);
  [orderId] = (await e2eQuery<{ id: string }>(`INSERT INTO "Order" (id, "tableId", "waiterId", "lastRound")
    SELECT gen_random_uuid(), $1, id, 1 FROM "User" WHERE email = $2 RETURNING id`, [tableId, LAURA.email])).map((r) => r.id);
  await e2eQuery(`INSERT INTO "OrderItem" (id, "orderId", "productId", "productName", "unitPrice", quantity, round, status)
    VALUES (gen_random_uuid(), $1, $2, 'Cobro E2E', 10000000, 1, 1, 'SERVED')`, [orderId, productId]);
});

test.afterAll(async () => {
  try {
    await e2eQuery(`DELETE FROM "Bill" WHERE "orderId" = $1`, [orderId]);
    await e2eQuery(`DELETE FROM "Order" WHERE id = $1`, [orderId]);
    await e2eQuery(`DELETE FROM "Table" WHERE id = $1`, [tableId]);
    await e2eQuery(`DELETE FROM "Product" WHERE id = $1`, [productId]);
    await e2eQuery(`DELETE FROM "Category" WHERE id = $1`, [categoryId]);
  } finally { await closeE2EPool(); }
});

test("registra cuenta por transferencia y propina en efectivo, cambio y Ventas", async ({ page }) => {
  await loginStaff(page, LAURA);
  // Aislamos la respuesta perdida: sin SSE, el formulario debe recuperar el cierre por reintento.
  await page.route("**/api/events", (route) => route.abort());
  let lostResponse = false;
  const operationIds: string[] = [];
  await page.route(`**/staff/mesas/${tableId}`, async (route) => {
    const body = route.request().postData() ?? "";
    if (route.request().method() === "POST" && body.includes("closeOperationId")) {
      operationIds.push(body.match(/"closeOperationId":"([^"]+)"/)![1]);
      if (!lostResponse) {
        await route.fetch();
        lostResponse = true;
        await route.abort();
        return;
      }
    }
    await route.continue();
  });
  await page.goto(`/staff/mesas/${tableId}`);
  await page.getByRole("button", { name: "Finalizar servicio", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Finalizar servicio", exact: true });
  await dialog.getByLabel("Método de pago usado").selectOption("MIXED");
  await dialog.getByRole("button", { name: "10 %", exact: true }).click();
  await dialog.getByLabel("Transferencia", { exact: true }).fill("100000");
  await dialog.getByLabel("Propina en efectivo", { exact: true }).fill("10000");
  await dialog.getByLabel("Efectivo recibido", { exact: true }).fill("20000");
  await expect(dialog.getByText(`Cambio: ${cop(1_000_000)}`, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Registrar pago y finalizar", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Reintentar el mismo pago", exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Transferencia", { exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Finalizar servicio", exact: true }).click();
  await dialog.getByRole("button", { name: "Reintentar el mismo pago", exact: true }).click();
  const bill = page.getByRole("article", { name: "Cuenta, mesa 987653" });
  await expect(bill).toBeVisible();
  const amount = (label: string) => bill.locator(`dt:text-is("${label}") ~ dd`);
  await expect(amount("Propina en efectivo")).toHaveText(cop(1_000_000));
  await expect(amount("Propina por transferencia")).toHaveText(cop(0));
  await expect(amount("Cambio")).toHaveText(cop(1_000_000));
  await expect(amount("Total registrado")).toHaveText(cop(11_000_000));
  const [persisted] = await e2eQuery<{ id: string; n: number }>(`SELECT id, count(*) OVER ()::int AS n FROM "Bill" WHERE "orderId" = $1`, [orderId]);
  expect(persisted.n).toBe(1);
  expect(operationIds).toHaveLength(2);
  expect(operationIds[0]).toBe(operationIds[1]);
  await page.unroute("**/api/events");
  await page.reload();
  await expect(bill).toContainText(persisted.id);
  await expect(amount("Efectivo recibido")).toHaveText(cop(2_000_000));
  await loginStaff(page, { email: "admin@mesaviva.co", password: process.env.SEED_ADMIN_PASSWORD ?? "admin123" });
  await page.goto("/staff/admin/ventas");
  const day = await page.getByLabel("Desde").inputValue();
  const [tips] = await e2eQuery<{ cash: string; transfer: string }>(`SELECT COALESCE(sum(b."tipCashAmount"), 0)::text AS cash,
    COALESCE(sum(b."tipTransferAmount"), 0)::text AS transfer FROM "Bill" b JOIN "Order" o ON o.id = b."orderId"
    WHERE o.status = 'CLOSED' AND o."closedAt" >= ($1::date + time '05:00') AND o."closedAt" < ($1::date + interval '1 day' + time '05:00')`, [day]);
  await expect(page.locator('dt:text-is("Propina en efectivo (incluida en cobros)") + dd')).toHaveText(cop(Number(tips.cash)));
  await expect(page.locator('dt:text-is("Propina por transferencia (incluida en cobros)") + dd')).toHaveText(cop(Number(tips.transfer)));
});
