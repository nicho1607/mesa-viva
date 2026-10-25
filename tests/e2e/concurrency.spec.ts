// Dos clientes en la misma mesa (sin orden abierta) envían a la vez: ambos pedidos entran
// y queda una sola orden OPEN con las rondas 1 y 2 (índice único parcial + reintento).

import { expect, test } from "@playwright/test";
import { closeE2EPool, e2eQuery, getTable } from "./support/e2e-db";
import { addDish, newCustomerPage } from "./support/helpers";

test.afterAll(closeE2EPool);

test("dos envíos simultáneos a una mesa libre abren una sola orden", async ({ browser }) => {
  const table = await getTable(4);
  const before = await e2eQuery<{ n: number }>(`SELECT count(*)::int AS n FROM "Order" WHERE "tableId" = $1`, [table.id]);
  expect(before[0].n).toBe(0);

  const a = await newCustomerPage(browser);
  const b = await newCustomerPage(browser);
  try {
    await Promise.all([a.goto(`/m/${table.publicToken}`), b.goto(`/m/${table.publicToken}`)]);
    await addDish(a, "Empanadas vallunas");
    await addDish(b, "Jugo de lulo", "Sin hielo");
    for (const p of [a, b]) {
      await p.getByRole("button", { name: /^Ver pedido \(1\)/ }).click();
      await expect(p.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
    }

    await Promise.all([
      a.getByRole("button", { name: "Enviar pedido" }).click(),
      b.getByRole("button", { name: "Enviar pedido" }).click(),
    ]);

    const sent = (p: typeof a) => p.getByRole("dialog", { name: /^Pedido enviado · Ronda \d$/ });
    await expect(sent(a)).toBeVisible();
    await expect(sent(b)).toBeVisible();
    const titles = [await sent(a).getByRole("heading").first().innerText(), await sent(b).getByRole("heading").first().innerText()];
    expect(titles.sort()).toEqual(["Pedido enviado · Ronda 1", "Pedido enviado · Ronda 2"]);

    const orders = await e2eQuery<{ id: string; status: string }>(
      `SELECT id, status::text AS status FROM "Order" WHERE "tableId" = $1`,
      [table.id],
    );
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("OPEN");

    const items = await e2eQuery<{ round: number; name: string }>(
      `SELECT i.round, p.name FROM "OrderItem" i JOIN "Product" p ON p.id = i."productId"
        WHERE i."orderId" = $1 ORDER BY i.round`,
      [orders[0].id],
    );
    expect(items.map((i) => i.round)).toEqual([1, 2]);
    expect(items.map((i) => i.name).sort()).toEqual(["Empanadas vallunas", "Jugo de lulo"]);
  } finally {
    await a.context().close();
    await b.context().close();
  }
});
