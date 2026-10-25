// Permisos y códigos: un mesero no entra a mesas de otra zona y un QR inválido avisa al cliente.

import { expect, test } from "@playwright/test";
import { closeE2EPool, getTable } from "./support/e2e-db";
import { ANDRES, loginStaff, newCustomerPage, newWaiterPage, tableTile } from "./support/helpers";

test.afterAll(closeE2EPool);

test("Andrés no puede abrir una mesa de la zona de Laura", async ({ browser }) => {
  const lauras = await getTable(2);
  const page = await newWaiterPage(browser);
  try {
    await loginStaff(page, ANDRES);
    await expect(tableTile(page, 5)).toBeVisible();
    await expect(tableTile(page, 2)).toHaveCount(0);

    await page.goto(`/staff/mesas/${lauras.id}`);
    await expect(page.getByRole("heading", { name: "Esta mesa no está asignada a ti." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Finalizar servicio" })).toHaveCount(0);
  } finally {
    await page.context().close();
  }
});

test("un código QR inválido muestra el aviso", async ({ browser }) => {
  const page = await newCustomerPage(browser);
  try {
    await page.goto("/m/codigo-que-no-existe-123");
    await expect(page.getByRole("heading", { name: "Este código no es válido, pide ayuda al mesero" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Ver pedido/ })).toHaveCount(0);
  } finally {
    await page.context().close();
  }
});

test("sin sesión, /staff lleva al login", async ({ page }) => {
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/staff\/login/);
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
});
