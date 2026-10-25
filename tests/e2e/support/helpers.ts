import { expect, type Browser, type Page } from "@playwright/test";

export const CUSTOMER_VIEWPORT = { width: 390, height: 844 };
export const WAITER_VIEWPORT = { width: 1024, height: 768 };

export const LAURA = { email: "laura@mesaviva.co", password: "mesero123", name: "Laura Gómez" };
export const ANDRES = { email: "andres@mesaviva.co", password: "mesero123", name: "Andrés Restrepo" };

export async function newCustomerPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: CUSTOMER_VIEWPORT, hasTouch: true, isMobile: true });
  return ctx.newPage();
}

export async function newWaiterPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: WAITER_VIEWPORT });
  return ctx.newPage();
}

/**
 * Espera a que la página abra su stream SSE (`/api/events`) con 200. Llamar ANTES de la
 * navegación y `await` después: así ninguna señal posterior se pierde.
 */
export function waitForRealtime(page: Page) {
  return page.waitForResponse((r) => r.url().includes("/api/events") && r.status() === 200);
}

/** Inicia sesión por el formulario y termina en el plano (/staff) con el stream conectado. */
export async function loginStaff(page: Page, user: { email: string; password: string }) {
  await page.goto("/staff/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Contraseña").fill(user.password);
  const realtime = waitForRealtime(page);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/staff$/);
  await realtime;
}

/** Ficha de una mesa en el plano (enlace "Mesa N, <estado>. Ver detalle"). */
export function tableTile(page: Page, number: number) {
  return page.getByRole("link", { name: new RegExp(`^Mesa ${number}, .*Ver detalle$`) });
}

/** Abre un plato del menú del cliente, opcionalmente escribe una nota y lo agrega al pedido. */
export async function addDish(page: Page, name: string, note?: string) {
  const dialog = page.getByRole("dialog", { name });
  // Reintenta el toque mientras la página termina de hidratarse (antes el botón no responde).
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  if (note) await dialog.getByLabel(/Nota para la cocina/).fill(note);
  await dialog.getByRole("button", { name: /^Agregar ·/ }).click();
  await expect(dialog).toBeHidden();
}

/** Abre "Ver pedido", envía y comprueba "Pedido enviado · Ronda N". */
export async function sendOrder(page: Page, expectedRound: number) {
  await page.getByRole("button", { name: /^Ver pedido/ }).click();
  await page.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(page.getByRole("dialog", { name: `Pedido enviado · Ronda ${expectedRound}` })).toBeVisible();
}

/** Mismo formato que formatMoney (es-CO, COP sin decimales): "$ 89.100" con espacio no separable. */
export function cop(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
