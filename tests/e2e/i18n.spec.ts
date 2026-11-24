import { expect, test } from "@playwright/test";
import { closeE2EPool, e2eQuery } from "./support/e2e-db";
import { LAURA, loginStaff, newWaiterPage, waitForRealtime } from "./support/helpers";

// Traducciones sintéticas aprobadas SOLO en la BD E2E aislada.
const token = "e2e-customer-language-fixture";
const path = `/m/${token}`;
let categoryId = "", productId = "", tableId = "";

test.beforeAll(async () => {
  const [category] = await e2eQuery<{ id: string }>(`INSERT INTO "Category" (id, name, "nameEn", "sortOrder") VALUES (gen_random_uuid(), 'Idioma E2E', 'Language fixture', 999) RETURNING id`);
  categoryId = category.id;
  const [product] = await e2eQuery<{ id: string }>(`INSERT INTO "Product" (id, name, "nameEn", description, "descriptionEn", price, "categoryId", "sortOrder", available)
    VALUES (gen_random_uuid(), 'Sopa idioma E2E', 'Soup fixture', 'Sopa con papa', 'Potato soup fixture', 1200000, $1, 0, true) RETURNING id`, [categoryId]);
  productId = product.id;
  const [table] = await e2eQuery<{ id: string }>(`INSERT INTO "Table" (id, number, seats, "zoneId", "publicToken", status)
    SELECT gen_random_uuid(), 987654, 2, z.id, $1, 'AVAILABLE' FROM "Zone" z JOIN "User" u ON u.id = z."waiterId" WHERE u.email = $2 LIMIT 1 RETURNING id`, [token, LAURA.email]);
  tableId = table.id;
});
test.afterAll(async () => {
  try {
    await e2eQuery(`DELETE FROM "Bill" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "tableId" = $1)`, [tableId]);
    await e2eQuery(`DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "tableId" = $1)`, [tableId]);
    await e2eQuery(`DELETE FROM "Order" WHERE "tableId" = $1`, [tableId]);
    await e2eQuery(`DELETE FROM "Table" WHERE id = $1`, [tableId]);
    await e2eQuery(`DELETE FROM "Product" WHERE id = $1`, [productId]);
    await e2eQuery(`DELETE FROM "Category" WHERE id = $1`, [categoryId]);
  } finally { await closeE2EPool(); }
});

test("inglés: borradores, estado local, envío único, cuenta SSE y cierre español", async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  await expect(page.getByRole("combobox", { name: "Idioma" })).toHaveValue("es");
  await page.getByRole("combobox").selectOption("en");
  expect((await page.context().cookies()).find((cookie) => cookie.name === "mv_customer_locale")).toMatchObject({
    value: "en", path: "/m", sameSite: "Lax", secure: true,
  });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("English preview · translations not yet reviewed")).toBeVisible();
  const dish = page.getByRole("button", { name: /^Soup fixture/ });
  await dish.click();
  let dialog = page.getByRole("dialog", { name: "Soup fixture" });
  await dialog.getByRole("button", { name: "Add one Soup fixture" }).click();
  await dialog.getByRole("button", { name: "+ No onion", exact: true }).click();
  await expect(dialog.getByLabel(/Note for the kitchen/)).toHaveValue("Sin cebolla");
  await dialog.getByLabel(/Note for the kitchen/).fill("Sin cebolla, very hot");
  await page.keyboard.press("Escape");
  await expect(dish).toBeFocused();
  await page.getByRole("combobox").selectOption("es");
  await page.getByRole("button", { name: /^Sopa idioma E2E/ }).click();
  dialog = page.getByRole("dialog", { name: "Sopa idioma E2E" });
  await expect(dialog.getByLabel(/Nota para la cocina/)).toHaveValue("Sin cebolla, very hot");
  await expect(dialog.locator("output")).toHaveText("2");
  await dialog.getByRole("button", { name: /^Agregar ·/ }).click();
  const stored = await page.evaluate((key) => localStorage.getItem(key), `mv:cart:${token}`);
  await page.getByRole("combobox").selectOption("en");
  expect(await page.evaluate((key) => localStorage.getItem(key), `mv:cart:${token}`)).toBe(stored);
  await expect(page.getByRole("button", { name: /^View order \(2\)/ })).toContainText(/COP\s*24,000/);
  await page.reload();
  await expect(page.getByRole("combobox")).toHaveValue("en");
  await expect(page).toHaveTitle(/Menu · Table 987654/);
  await page.getByRole("button", { name: /^View order/ }).click();
  const cart = page.getByRole("dialog", { name: "Your order" });
  await cart.getByRole("button", { name: "Edit note" }).click();
  await cart.getByLabel(/Note for the kitchen/).fill("Sin cebolla, very hot, thanks");
  await cart.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("combobox").selectOption("es");
  await page.getByRole("button", { name: /^Ver pedido/ }).click();
  await expect(page.getByLabel(/Nota para la cocina/)).toHaveValue("Sin cebolla, very hot, thanks");
  await page.getByRole("button", { name: "Guardar nota" }).click();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("combobox").selectOption("en");
  await page.getByRole("button", { name: /^View order/ }).click();

  let submissions = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      submissions++;
      await gate;
    }
    await route.continue();
  });
  try {
    await cart.getByRole("button", { name: "Send order" }).click();
    await expect(cart.getByRole("button", { name: "Sending…" })).toBeDisabled();
    await cart.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("combobox").selectOption("es");
    await page.getByRole("button", { name: /^Ver pedido/ }).click();
    await expect(page.getByRole("button", { name: "Enviando…" })).toBeDisabled();
    release();
    await expect(page.getByRole("dialog", { name: "Pedido enviado · Ronda 1" })).toBeVisible();
    expect(submissions).toBe(1);
  } finally { release(); await page.unroute(`**${path}`); }
  await page.getByRole("button", { name: "Seguir pidiendo" }).click();
  await page.getByRole("combobox").selectOption("en");
  const ready = waitForRealtime(page);
  await page.getByRole("link", { name: "My bill", exact: true }).click();
  await ready;
  const round = page.getByRole("region", { name: "Order round 1", exact: true });
  await expect(round.getByText("Soup fixture", { exact: true })).toBeVisible();
  await expect(round.getByText("Sin cebolla, very hot, thanks")).toBeVisible();
  await expect(page.getByText("Order status: In preparation", { exact: true })).toBeVisible();
  const billState = await e2eQuery<{ n: number }>(`SELECT count(*)::int AS n FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "tableId"=$1)`, [tableId]);
  expect(billState[0].n).toBe(1);

  const waiter = await newWaiterPage(browser);
  try {
    await loginStaff(waiter, LAURA);
    const staffReady = waitForRealtime(waiter);
    await waiter.goto(`/staff/mesas/${tableId}`);
    await staffReady;
    await expect(waiter.locator("html")).toHaveAttribute("lang", "es");
    await expect(waiter.getByText("Sopa idioma E2E", { exact: true })).toBeVisible();
    await waiter.getByRole("button", { name: "Confirmar ronda", exact: true }).click();
    await expect(round.getByText("in the kitchen", { exact: true })).toBeVisible();
    await waiter.getByRole("button", { name: "Ronda servida", exact: true }).click();
    await expect(page.getByText("Order status: Served", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Call your server", exact: true }).click();
    await expect(page.getByText("We've notified your server.")).toBeVisible();
    await page.getByRole("combobox").selectOption("es");
    await expect(page.locator('p.sr-only[aria-live="polite"]')).toHaveText("");
    await expect(page.locator(".mv-print")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Llamar al mesero", exact: true })).toBeDisabled();
    await expect(page.getByText("Avisamos a tu mesero. Viene en un momento.")).toBeVisible();
    await page.getByRole("combobox").selectOption("en");
    await expect(page.getByRole("button", { name: "Call your server", exact: true })).toBeEnabled({ timeout: 12000 });
    await page.getByRole("button", { name: "Ask for the bill", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Payment method", exact: true });
    await picker.getByRole("button", { name: "Cash", exact: true }).click();
    await expect(page.getByText("We've asked your server to bring the bill.")).toBeVisible();
    await expect(waiter.getByText("Método solicitado: Efectivo")).toBeVisible();
    await waiter.getByRole("button", { name: "Finalizar servicio", exact: true }).click();
    const close = waiter.getByRole("dialog", { name: "Finalizar servicio", exact: true });
    await close.getByLabel("Efectivo recibido", { exact: true }).fill("30000");
    await close.getByRole("button", { name: "Registrar pago y finalizar" }).click();
    await expect(page.getByText("Order closed", { exact: true })).toBeVisible();
    await expect(page.locator('dt:text-is("Payment method") ~ dd')).toHaveText("Cash");
    await expect(waiter.getByRole("article", { name: "Cuenta, mesa 987654" })).toContainText("Sopa idioma E2E");
    await expect(waiter.getByRole("button", { name: "Imprimir cuenta" })).toBeVisible();
    await page.screenshot({ path: "test-results/cliente-ingles-borrador.png", fullPage: true });
  } finally { await waiter.context().close(); }
});

test("errores de red se retraducen sin reenvío y la navegación conserva el idioma", async ({ page }) => {
  await page.goto(path);
  await page.getByRole("combobox").selectOption("en");
  await page.getByRole("button", { name: /^Soup fixture/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Add ·/ }).click();
  await page.getByRole("button", { name: /^View order/ }).click();
  let posts = 0;
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() === "POST") { posts++; await route.abort(); }
    else await route.continue();
  });
  await page.getByRole("button", { name: "Send order", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("No connection. Check your internet and try again.");
  await page.keyboard.press("Escape");
  await page.getByRole("combobox").selectOption("es");
  await page.getByRole("button", { name: /^Ver pedido/ }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
  expect(posts).toBe(1);
  await page.unroute(`**${path}`);
  await page.keyboard.press("Escape");
  await page.getByRole("combobox").selectOption("en");
  await page.getByRole("link", { name: "My bill", exact: true }).click();
  await expect(page.getByRole("combobox")).toHaveValue("en");
  await page.getByRole("link", { name: "Back to menu" }).click();
  await expect(page.getByRole("button", { name: /^View order \(1\)/ })).toBeVisible();
  // La cookie del cliente no cambia el idioma del personal en el mismo navegador.
  await page.goto("/staff/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
});

test("sin cookies: inglés en memoria; tras recarga vuelve a español; QR inválido traducible", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "cookie", { configurable: true, get: () => "", set: () => { throw new Error("cookies blocked"); } });
  });
  await page.goto(path);
  await page.getByRole("combobox").selectOption("en");
  await page.getByRole("link", { name: "My bill", exact: true }).click();
  await expect(page.getByRole("combobox")).toHaveValue("en");
  await page.reload();
  await expect(page.getByRole("combobox")).toHaveValue("es");
  await page.goto("/m/e2e-invalid-language-token");
  await page.getByRole("combobox").selectOption("en");
  await expect(page.getByRole("heading", { name: "This code is not valid. Please ask your server for help" })).toBeVisible();
});

test("fallback identificado y pseudolocalización a 320 px y zoom de texto 200%", async ({ page }) => {
  const long = "[Šøüp ƒïxţürë — ".repeat(6) + "]";
  await e2eQuery(`UPDATE "Product" SET "nameEn" = NULL, "descriptionEn" = NULL WHERE id = $1`, [productId]);
  try {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(path);
    await page.getByRole("combobox").selectOption("en");
    const original = page.getByRole("button", { name: /^Sopa idioma E2E/ });
    await expect(original).toContainText("Shown in Spanish");
    await expect(original.locator('span[lang="es"]').first()).toContainText("Sopa idioma E2E");
    await e2eQuery(`UPDATE "Product" SET "nameEn" = $2, "descriptionEn" = $3 WHERE id = $1`, [productId, long, "[Potato soup description with expanded text for layout verification.] ".repeat(7)]);
    await page.reload();
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    await page.getByRole("button", { name: new RegExp("^\\[Šøüp") }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: /^Add ·/ })).toBeInViewport();
    const overflow = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => {
      if (el.closest("nav") || el.closest("dialog:not([open])") || el.classList.contains("sr-only")) return false;
      const box = el.getBoundingClientRect();
      return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
    }).map((el) => `${el.tagName}.${el.className}: ${el.textContent?.slice(0, 40)}`));
    expect(overflow).toEqual([]);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: "test-results/cliente-ingles-textos-largos.png", fullPage: true });
  } finally {
    await e2eQuery(`UPDATE "Product" SET "nameEn" = 'Soup fixture', "descriptionEn" = 'Potato soup fixture' WHERE id = $1`, [productId]);
  }
});

test("SSE vuelve a conectar manteniendo idioma y rondas", async ({ page, context, baseURL }) => {
  await page.addInitScript(() => {
    const NativeEventSource = window.EventSource;
    window.EventSource = class extends NativeEventSource {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options);
        window.addEventListener("e2e-disconnect", () => {
          // Simular un error con estado CLOSED; ambas conexiones usan el SSE real.
          this.close();
          this.dispatchEvent(new Event("error"));
        }, { once: true });
      }
    };
  });
  await context.addCookies([{ name: "mv_customer_locale", value: "en", url: `${baseURL}/m`, sameSite: "Lax" }]);
  await page.goto(path);
  await page.getByRole("button", { name: /^Soup fixture/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Add ·/ }).click();
  await page.getByRole("button", { name: /^View order/ }).click();
  await page.getByRole("button", { name: "Send order", exact: true }).click();
  await expect(page.getByRole("dialog", { name: /^Order sent/ })).toBeVisible();
  let connections = 0;
  page.on("request", (request) => { if (request.url().includes("/api/events?table=")) connections++; });
  const ready = waitForRealtime(page);
  await page.getByRole("dialog").getByRole("link", { name: "View my bill" }).click();
  await ready;
  await expect(page.getByRole("region", { name: "Order round 1", exact: true })).toBeVisible();
  await page.getByRole("combobox").selectOption("es");
  await page.getByRole("combobox").selectOption("en");
  expect(connections).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("e2e-disconnect")));
  await expect(page.getByText("Reconnecting…", { exact: true })).toBeVisible();
  await expect(page.getByText("Reconnecting…", { exact: true })).toBeHidden({ timeout: 15000 });
  expect(connections).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("combobox")).toHaveValue("en");
  await expect(page.getByRole("region", { name: "Order round 1", exact: true })).toHaveCount(1);
  await expect(page.locator(".mv-print")).toHaveCount(0);
});
