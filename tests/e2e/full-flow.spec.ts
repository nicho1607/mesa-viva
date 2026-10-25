// Flujo completo: escanear, pedir, confirmar, añadir ronda, servir, pedir la cuenta y cerrar,
// con un cliente (móvil) y la mesera Laura (tableta) en contextos separados y en tiempo real.

import { expect, test } from "@playwright/test";
import { closeE2EPool, e2eQuery, getProductPrice, getSetting, getTable } from "./support/e2e-db";
import {
  LAURA,
  addDish,
  cop,
  loginStaff,
  newCustomerPage,
  newWaiterPage,
  sendOrder,
  tableTile,
  waitForRealtime,
} from "./support/helpers";

test.afterAll(closeE2EPool);

test("cliente y mesera: del QR a la cuenta final", async ({ browser }) => {
  const table = await getTable(1);
  const [bandeja, ajiaco, limonada] = await Promise.all([
    getProductPrice("Bandeja paisa"),
    getProductPrice("Ajiaco santafereño"),
    getProductPrice("Limonada de coco"),
  ]);
  expect(await getSetting("pricesIncludeTax")).toBe("true"); // IVA incluido: total = subtotal + propina
  const subtotal = bandeja + ajiaco + limonada;
  const tip = Math.round(subtotal * 0.1);
  const expectedTotal = subtotal + tip;

  const waiter = await newWaiterPage(browser);
  const customer = await newCustomerPage(browser);

  try {
    // 1. Laura entra y ve su salón: mesas 1–4 (y no las de la terraza).
    await test.step("la mesera ve su plano", async () => {
      await loginStaff(waiter, LAURA);
      for (const n of [1, 2, 3, 4]) await expect(tableTile(waiter, n)).toBeVisible();
      await expect(tableTile(waiter, 5)).toHaveCount(0);
      await expect(tableTile(waiter, 1)).toHaveAccessibleName(/Libre/);
    });

    // 2. El cliente abre el menú de la mesa 1 y envía la ronda 1.
    await test.step("el cliente envía la ronda 1", async () => {
      await customer.goto(`/m/${table.publicToken}`);
      await expect(customer.getByText("Mesa 1", { exact: true })).toBeVisible();
      await addDish(customer, "Bandeja paisa", "Sin cebolla");
      await addDish(customer, "Ajiaco santafereño");
      await expect(customer.getByRole("button", { name: /^Ver pedido \(2\)/ })).toBeVisible();
      await sendOrder(customer, 1);
    });

    // 3. Aviso y ficha en vivo (sin recargar); la mesera abre la mesa y confirma la ronda 1.
    await test.step("la mesera recibe la ronda 1 y la confirma", async () => {
      await expect(waiter.getByRole("status").getByText("Mesa 1 · Ronda 1", { exact: true })).toBeVisible();
      await expect(tableTile(waiter, 1)).toHaveAccessibleName(/Ronda sin confirmar/);
      const detailRealtime = waitForRealtime(waiter);
      await tableTile(waiter, 1).click();
      await waiter.waitForURL(`**/staff/mesas/${table.id}`);
      await detailRealtime;
      const round1 = waiter.getByRole("region", { name: "Ronda 1" });
      await expect(round1.getByText("Sin cebolla")).toBeVisible();
      await round1.getByRole("button", { name: "Confirmar ronda" }).click();
      await expect(round1.getByRole("button", { name: "Ronda servida" })).toBeVisible();
    });

    // 4. La cuenta del cliente muestra "En preparación"; pide una bebida (ronda 2) y la mesera la ve en vivo.
    await test.step("el cliente ve su cuenta y pide la ronda 2", async () => {
      const billRealtime = waitForRealtime(customer);
      await customer.getByRole("dialog").getByRole("link", { name: "Ver mi cuenta" }).click();
      await customer.waitForURL(`**/m/${table.publicToken}/cuenta`);
      await billRealtime;
      await expect(customer.getByText("Estado del pedido: En preparación", { exact: true })).toBeVisible();
      await expect(customer.getByRole("region", { name: "Ronda 1" }).getByText("en cocina")).toHaveCount(2);

      await customer.getByRole("link", { name: "Volver al menú" }).click();
      await customer.waitForURL(`**/m/${table.publicToken}`);
      await addDish(customer, "Limonada de coco");
      await sendOrder(customer, 2);

      const round2 = waiter.getByRole("region", { name: "Ronda 2" });
      await expect(round2.getByText("Limonada de coco")).toBeVisible();
      await expect(round2.getByText("Sin confirmar", { exact: true })).toBeVisible();

      // El cliente se queda mirando su cuenta (todo lo que sigue le llega en vivo).
      const billRealtime2 = waitForRealtime(customer);
      await customer.getByRole("dialog").getByRole("link", { name: "Ver mi cuenta" }).click();
      await customer.waitForURL(`**/m/${table.publicToken}/cuenta`);
      await billRealtime2;
      await expect(customer.getByRole("region", { name: "Ronda 2" })).toBeVisible();
    });

    // 5. Confirma la ronda 2 y sirve todo; el cliente ve "Servido" sin recargar.
    await test.step("la mesera sirve todas las rondas", async () => {
      const round1 = waiter.getByRole("region", { name: "Ronda 1" });
      const round2 = waiter.getByRole("region", { name: "Ronda 2" });
      await round2.getByRole("button", { name: "Confirmar ronda" }).click();
      await expect(round2.getByRole("button", { name: "Ronda servida" })).toBeVisible();
      await round2.getByRole("button", { name: "Ronda servida" }).click();
      await expect(round2.getByRole("button", { name: "Ronda servida" })).toHaveCount(0);
      await round1.getByRole("button", { name: "Ronda servida" }).click();
      await expect(round1.getByRole("button", { name: "Ronda servida" })).toHaveCount(0);

      await expect(customer.getByText("Estado del pedido: Servido", { exact: true })).toBeVisible();
      await expect(customer.locator('dt:text-is("Subtotal") ~ dd')).toHaveText(cop(subtotal));
    });

    // 6. El cliente pide la cuenta → el plano lo muestra.
    await test.step("el cliente pide la cuenta", async () => {
      const floorRealtime = waitForRealtime(waiter);
      await waiter.getByRole("link", { name: "Plano de mesas" }).click();
      await waiter.waitForURL(/\/staff$/);
      await floorRealtime;
      await customer.getByRole("button", { name: "Pedir la cuenta" }).click();
      await expect(customer.getByText("Te trae la cuenta en un momento.", { exact: false })).toBeVisible();
      await expect(tableTile(waiter, 1)).toHaveAccessibleName(/Piden la cuenta/);
      await expect(waiter.getByRole("status").getByText("Mesa 1 pide la cuenta", { exact: true })).toBeVisible();
    });

    // 7. Finaliza con 10 % de propina → cuenta final; el cliente ve "Servicio finalizado" y el mismo total.
    await test.step("la mesera finaliza el servicio", async () => {
      const detailRealtime = waitForRealtime(waiter);
      await tableTile(waiter, 1).click();
      await waiter.waitForURL(`**/staff/mesas/${table.id}`);
      await detailRealtime;
      await expect(waiter.getByText("La mesa pide la cuenta.")).toBeVisible();
      await waiter.getByRole("button", { name: "Finalizar servicio" }).click();
      const dialog = waiter.getByRole("dialog", { name: "Finalizar servicio" });
      await dialog.getByRole("button", { name: "10 %" }).click();
      await expect(dialog.getByRole("button", { name: "10 %" })).toHaveAttribute("aria-pressed", "true");
      await expect(dialog.getByText(/productos? sin servir/)).toHaveCount(0);
      await expect(dialog.locator('dt:text-is("Total") ~ dd')).toHaveText(cop(expectedTotal));
      await dialog.getByRole("button", { name: "Finalizar y generar cuenta" }).click();

      await expect(waiter.getByText("Servicio finalizado. La mesa quedó libre.")).toBeVisible();
      const finalBill = waiter.getByRole("article", { name: "Cuenta, mesa 1" });
      await expect(finalBill.locator('dt:text-is("Subtotal") ~ dd')).toHaveText(cop(subtotal));
      await expect(finalBill.locator('dt:text-is("Propina (10 %)") ~ dd')).toHaveText(cop(tip));
      await expect(finalBill.locator('dt:text-is("Total a pagar") ~ dd')).toHaveText(cop(expectedTotal));
      await expect(finalBill.getByText("Sin cebolla")).toBeVisible();

      await expect(customer.getByText("Servicio finalizado", { exact: true })).toBeVisible();
      await expect(customer.locator('dt:text-is("Total") ~ dd')).toHaveText(cop(expectedTotal));
      await expect(customer.getByRole("button", { name: "Pedir la cuenta" })).toHaveCount(0);

      const bills = await e2eQuery<{ subtotal: number; tipAmount: number; total: number; status: string }>(
        `SELECT b.subtotal, b."tipAmount", b.total, o.status::text AS status
           FROM "Bill" b JOIN "Order" o ON o.id = b."orderId"
          WHERE o."tableId" = $1`,
        [table.id],
      );
      expect(bills).toEqual([{ subtotal, tipAmount: tip, total: expectedTotal, status: "CLOSED" }]);
    });

    // 8. La mesa vuelve a estar libre en el plano.
    await test.step("el plano muestra la mesa libre", async () => {
      await waiter.getByRole("link", { name: "Plano de mesas" }).click();
      await waiter.waitForURL(/\/staff$/);
      await expect(tableTile(waiter, 1)).toHaveAccessibleName(/Libre/);
      const [t] = await e2eQuery<{ status: string }>(`SELECT status::text AS status FROM "Table" WHERE id = $1`, [table.id]);
      expect(t.status).toBe("AVAILABLE");
    });
  } finally {
    await customer.context().close();
    await waiter.context().close();
  }
});
