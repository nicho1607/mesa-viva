import { randomUUID } from "node:crypto";
import { expect, test, type Request } from "@playwright/test";
import { closeE2EPool, e2eQuery } from "./support/e2e-db";
import { ANDRES, LAURA, cop, loginStaff, newCustomerPage, newWaiterPage, waitForRealtime } from "./support/helpers";

const tableId = randomUUID(), orderId = randomUUID(), categoryId = randomUUID(), productId = randomUUID();
const itemIds = [randomUUID(), randomUUID(), randomUUID()];
const token = randomUUID();
const number = 987654;

test.beforeAll(async () => {
  await e2eQuery(`INSERT INTO "Category" (id, name) VALUES ($1, $2)`, [categoryId, token]);
  await e2eQuery(`INSERT INTO "Product" (id, name, price, "categoryId", "availableQuantity")
    VALUES ($1, 'Plato cancelación E2E', 1000000, $2, 7)`, [productId, categoryId]);
  await e2eQuery(`INSERT INTO "Table" (id, number, "zoneId", "publicToken", status)
    SELECT $1, $2, z.id, $3, 'OCCUPIED' FROM "Zone" z JOIN "User" u ON u.id = z."waiterId"
    WHERE u.email = $4 LIMIT 1`, [tableId, number, token, LAURA.email]);
  await e2eQuery(`INSERT INTO "Order" (id, "tableId", "waiterId", "lastRound")
    SELECT $1, $2, id, 1 FROM "User" WHERE email = $3`, [orderId, tableId, LAURA.email]);
  for (let i = 0; i < itemIds.length; i++) {
    await e2eQuery(`INSERT INTO "OrderItem" (id, "orderId", "productId", "productName", "unitPrice", quantity, round, status)
      VALUES ($1, $2, $3, $4, 1000000, 1, 1, $5::"ItemStatus")`,
    [itemIds[i], orderId, productId, `Plato ${i + 1}`, i === 0 ? "PENDING" : "IN_PREPARATION"]);
  }
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

test("cancelar actualiza la cuenta y ambas acciones protegen el comprobante emitido", async ({ browser }) => {
  const waiter = await newWaiterPage(browser);
  const outsider = await newWaiterPage(browser);
  const customer = await newCustomerPage(browser);
  try {
    await loginStaff(waiter, LAURA);
    await loginStaff(outsider, ANDRES);
    const ready = waitForRealtime(waiter);
    await waiter.goto(`/staff/mesas/${tableId}`);
    await ready;
    const customerReady = waitForRealtime(customer);
    await customer.goto(`/m/${token}/cuenta`);
    await customerReady;
    await expect(customer.locator('dt:text-is("Subtotal") ~ dd')).toHaveText(cop(3_000_000));

    const actionRequest = (id: string) => waiter.waitForRequest((r) =>
      r.method() === "POST" && !!r.headers()["next-action"] && (r.postData() ?? "").includes(id));
    const replay = async (request: Request, page = waiter, body = request.postData()!) => {
      const headers = request.headers();
      // La cookie proviene del contexto que reintenta: nunca reutilizar la sesión de Laura con Andrés.
      const response = await page.request.post(request.url(), { data: body, headers: {
        "next-action": headers["next-action"], "content-type": headers["content-type"], origin: new URL(request.url()).origin,
      } });
      expect(response.ok()).toBe(true);
      return response.text();
    };
    const snapshot = async () => ({
      orders: await e2eQuery(`SELECT * FROM "Order" WHERE id = $1`, [orderId]),
      items: await e2eQuery(`SELECT * FROM "OrderItem" WHERE "orderId" = $1 ORDER BY id`, [orderId]),
      bills: await e2eQuery(`SELECT * FROM "Bill" WHERE "orderId" = $1`, [orderId]),
    });

    let cancelRequest!: Request;
    for (let i = 0; i < 2; i++) {
      const row = waiter.getByRole("listitem").filter({ hasText: `Plato ${i + 1}` });
      await row.getByRole("button", { name: "Cancelar", exact: true }).click();
      const pending = actionRequest(itemIds[i]);
      await row.getByRole("button", { name: "Sí, cancelar", exact: true }).click();
      cancelRequest = await pending;
      await expect(row.getByText("Cancelado", { exact: true })).toBeVisible();
      await expect(customer.getByRole("region", { name: "Ronda 1" }).getByText("Cancelado", { exact: true })).toHaveCount(i + 1);
      await expect(customer.locator('dt:text-is("Subtotal") ~ dd')).toHaveText(cop((2 - i) * 1_000_000));
    }
    const beforeRetry = await snapshot();
    expect(await replay(cancelRequest)).toContain('"ok":true');
    expect(await snapshot()).toEqual(beforeRetry);
    expect(await replay(cancelRequest, outsider)).toContain("FORBIDDEN");
    expect(await snapshot()).toEqual(beforeRetry);

    const serving = actionRequest(itemIds[2]);
    await waiter.getByRole("listitem").filter({ hasText: "Plato 3" }).getByRole("button", { name: "Servido", exact: true }).click();
    const statusRequest = await serving;
    await expect(customer.getByText("Estado del pedido: Servido", { exact: true })).toBeVisible();
    const cancellationBody = statusRequest.postData()!.replace('"SERVED"', '"CANCELLED"');
    expect(cancellationBody).not.toBe(statusRequest.postData());
    const served = await snapshot();
    expect(await replay(statusRequest, outsider, cancellationBody)).toContain("FORBIDDEN");
    expect(await replay(statusRequest, waiter, cancellationBody)).toContain("INVALID_TRANSITION");
    expect(await snapshot()).toEqual(served);

    await waiter.getByRole("button", { name: "Finalizar servicio", exact: true }).click();
    const dialog = waiter.getByRole("dialog", { name: "Finalizar servicio", exact: true });
    await dialog.getByLabel("Método de pago usado").selectOption("CARD");
    await dialog.getByRole("button", { name: "10 %", exact: true }).click();
    await dialog.getByRole("button", { name: /^(Registrar pago y finalizar|Finalizar y generar cuenta)$/ }).click();
    const bill = waiter.getByRole("article", { name: `Cuenta, mesa ${number}` });
    await expect(bill).toBeVisible();
    await expect(bill.getByText("Plato 3", { exact: true })).toBeVisible();
    await expect(bill.getByText(/^Plato [12]$/)).toHaveCount(0);
    await expect(customer.locator('dt:text-is("Total") ~ dd')).toHaveText(cop(1_100_000));
    const closed = await snapshot();
    expect(closed.orders[0]).toMatchObject({ status: "CLOSED" });
    expect(closed.bills).toHaveLength(1);
    expect(closed.bills[0]).toMatchObject({ subtotal: 1_000_000, taxAmount: 1_000_000 - Math.round(1_000_000 / 1.19),
      tipAmount: 100_000, total: 1_100_000, lines: [expect.objectContaining({ productName: "Plato 3", lineTotal: 1_000_000 })] });
    expect(closed.items.filter((i) => i.status === "CANCELLED")).toHaveLength(2);
    expect(await replay(cancelRequest)).toContain("ORDER_CLOSED");
    expect(await replay(statusRequest, waiter, cancellationBody)).toContain("ORDER_CLOSED");
    expect(await snapshot()).toEqual(closed);
    const [product] = await e2eQuery<{ availableQuantity: number }>(`SELECT "availableQuantity" FROM "Product" WHERE id = $1`, [productId]);
    expect(product.availableQuantity).toBe(7);
    await waiter.reload();
    await expect(bill.getByText("Plato 3", { exact: true })).toBeVisible();
    await expect(bill.getByRole("button", { name: /Cancelar/ })).toHaveCount(0);
    expect(await snapshot()).toEqual(closed);
  } finally {
    await Promise.all([waiter, outsider, customer].map((page) => page.context().close()));
  }
});
