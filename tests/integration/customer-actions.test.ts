// Server Actions del cliente (src/app/actions/order.actions.ts) y consultas de lectura.
// El archivo "use server" no importa nada de Next, así que se importa directamente.
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { callWaiter, getMenu, getTableBill, getTableByToken, submitOrder } from "@/app/actions/order.actions";
import { db } from "@/lib/db";
import { closeOrder, setItemStatus } from "@/lib/domain/orders";
import { CLOSED_BILL_WINDOW_MS, getTableBillData } from "@/lib/domain/queries";
import { closeBusForTests, ensureConnected, subscribe, type BusMessage } from "@/lib/realtime/bus";
import { FLOOR_CHANNEL, tableChannel, waiterChannel } from "@/lib/realtime/events";
import { resetRateLimitsForTests } from "@/lib/rate-limit";

const tag = randomBytes(4).toString("hex");
const f = {
  waiterId: "",
  staffId: "",
  zoneId: "",
  catA: "", // sortOrder -1000 (va primero)
  catB: "", // sortOrder -999
  catEmpty: "",
  burger: { id: "", price: 25_000_00 },
  soda: { id: "", price: 6_000_00 },
  soldOut: { id: "" },
  tableIds: [] as string[],
};
let tableCounter = 0;

async function newTable(opts: { status?: "AVAILABLE" | "INACTIVE"; zoneId?: string } = {}) {
  tableCounter++;
  const table = await db.table.create({
    data: {
      number: 800_000 + (parseInt(tag, 16) % 90_000) * 10 + tableCounter,
      publicToken: `c${tag}${randomBytes(10).toString("hex")}`,
      zoneId: opts.zoneId ?? f.zoneId,
      status: opts.status ?? "AVAILABLE",
    },
  });
  f.tableIds.push(table.id);
  return table;
}

async function waitFor(cond: () => boolean, timeoutMs = 5_000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("timeout esperando condición");
    await new Promise((r) => setTimeout(r, 20));
  }
}

function collect(channel: string) {
  const got: BusMessage[] = [];
  subscribe(channel, (m) => got.push(m));
  return () => got.filter((m) => m.kind === "event");
}

beforeAll(async () => {
  const [waiter, staff] = await Promise.all([
    db.user.create({ data: { name: "Mesero ca", email: `mesero-ca-${tag}@test.local`, passwordHash: "x" } }),
    db.user.create({ data: { name: "Admin ca", email: `admin-ca-${tag}@test.local`, passwordHash: "x", role: "ADMIN" } }),
  ]);
  f.waiterId = waiter.id;
  f.staffId = staff.id;
  f.zoneId = (await db.zone.create({ data: { name: `Zona ca ${tag}`, waiterId: waiter.id } })).id;
  // Creadas en orden inverso a propósito: el orden debe venir de sortOrder
  f.catB = (await db.category.create({ data: { name: `B ${tag}`, sortOrder: -999 } })).id;
  f.catA = (await db.category.create({ data: { name: `A ${tag}`, sortOrder: -1000 } })).id;
  f.catEmpty = (await db.category.create({ data: { name: `Vacía ${tag}`, sortOrder: -1001 } })).id;
  const mk = (name: string, price: number, categoryId: string, sortOrder: number, available = true) =>
    db.product.create({ data: { name, price, available, categoryId, sortOrder } });
  f.soda.id = (await mk("Gaseosa", f.soda.price, f.catA, 2)).id;
  f.burger.id = (await mk("Hamburguesa", f.burger.price, f.catA, 1)).id;
  f.soldOut.id = (await mk("Agotado", 1_000_00, f.catB, 0, false)).id;
});

beforeEach(async () => {
  resetRateLimitsForTests();
  const settings = { taxRate: "0.19", tipRate: "0.10", pricesIncludeTax: "true", currency: "COP" };
  for (const [key, value] of Object.entries(settings)) {
    await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
});

afterEach(async () => {
  await closeBusForTests();
});

afterAll(async () => {
  resetRateLimitsForTests();
  const orders = await db.order.findMany({ where: { tableId: { in: f.tableIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await db.bill.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.table.deleteMany({ where: { id: { in: f.tableIds } } });
  await db.zone.deleteMany({ where: { id: f.zoneId } });
  await db.product.deleteMany({ where: { categoryId: { in: [f.catA, f.catB, f.catEmpty] } } });
  await db.category.deleteMany({ where: { id: { in: [f.catA, f.catB, f.catEmpty] } } });
  await db.user.deleteMany({ where: { id: { in: [f.waiterId, f.staffId] } } });
});

describe("getMenu / getTableByToken", () => {
  it("categorías y productos ordenados por sortOrder, agotados marcados, sin categorías vacías", async () => {
    const menu = await getMenu();
    const mine = menu.filter((c) => c.id === f.catA || c.id === f.catB || c.id === f.catEmpty);
    expect(mine.map((c) => c.id)).toEqual([f.catA, f.catB]);
    expect(mine[0].products.map((p) => p.name)).toEqual(["Hamburguesa", "Gaseosa"]);
    expect(mine[0].products[0]).toEqual({
      id: f.burger.id,
      name: "Hamburguesa",
      description: null,
      price: f.burger.price,
      imageUrl: null,
      available: true,
    });
    expect(mine[1].products).toEqual([expect.objectContaining({ id: f.soldOut.id, available: false })]);
  });

  it("getTableByToken: info pública o null si inválido / INACTIVE", async () => {
    const t = await newTable();
    const inactive = await newTable({ status: "INACTIVE" });
    expect(await getTableByToken(t.publicToken)).toEqual({ id: t.id, number: t.number, status: "AVAILABLE" });
    expect(await getTableByToken(inactive.publicToken)).toBeNull();
    expect(await getTableByToken("no-existe-este-token")).toBeNull();
    expect(await getTableByToken("")).toBeNull();
  });
});

describe("submitOrder", () => {
  it("crea la orden, publica order.opened y luego order.items_added en la mesa, el mesero y el salón", async () => {
    const t = await newTable();
    const table = collect(tableChannel(t.id));
    const waiter = collect(waiterChannel(f.waiterId));
    const floor = collect(FLOOR_CHANNEL);
    await ensureConnected();

    const r1 = await submitOrder(t.publicToken, [{ productId: f.burger.id, quantity: 2 }]);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.data.round).toBe(1);

    await waitFor(() => table().length === 1);
    expect(table()[0]).toEqual({
      kind: "event",
      event: "order.opened",
      payload: { orderId: r1.data.orderId, tableId: t.id, tableNumber: t.number, round: 1, version: 1 },
    });

    const r2 = await submitOrder(t.publicToken, [{ productId: f.soda.id, quantity: 1, notes: "Sin hielo" }]);
    expect(r2).toEqual({ ok: true, data: { orderId: r1.data.orderId, round: 2 } });
    await waitFor(() => table().length === 2);
    expect(table()[1]).toMatchObject({ event: "order.items_added", payload: { round: 2, version: 2 } });
    await waitFor(() => waiter().filter((m) => m.kind === "event" && m.payload.tableId === t.id).length === 2);
    await waitFor(() => floor().filter((m) => m.kind === "event" && m.payload.tableId === t.id).length === 2);
  });

  it("ignora precios enviados por el cliente", async () => {
    const t = await newTable();
    const items = [{ productId: f.burger.id, quantity: 1, unitPrice: 1, price: 1 }] as unknown as Parameters<
      typeof submitOrder
    >[1];
    const r = await submitOrder(t.publicToken, items);
    expect(r.ok).toBe(true);
    const saved = await db.orderItem.findFirstOrThrow({ where: { order: { tableId: t.id } } });
    expect(saved.unitPrice).toBe(f.burger.price);
  });

  it("devuelve errores tipados en vez de lanzar", async () => {
    const t = await newTable();
    expect(await submitOrder("token-que-no-existe-123", [{ productId: f.burger.id, quantity: 1 }])).toMatchObject({
      ok: false,
      code: "INVALID_TABLE",
    });
    expect(await submitOrder(t.publicToken, [{ productId: f.soldOut.id, quantity: 1 }])).toEqual({
      ok: false,
      error: "Algunos productos ya no están disponibles",
      code: "UNAVAILABLE_PRODUCTS",
      details: { productIds: [f.soldOut.id] },
    });
    const v = await submitOrder(t.publicToken, [{ productId: f.burger.id, quantity: 99 }]);
    expect(v).toMatchObject({ ok: false, code: "VALIDATION" });
    if (!v.ok) expect(v.error).toMatch(/^Revisa tu pedido: /);
  });

  it("rate limit: 10 envíos por minuto por token", async () => {
    const token = `rl-${tag}-0000000000`;
    for (let i = 0; i < 10; i++) {
      expect(await submitOrder(token, [{ productId: f.burger.id, quantity: 1 }])).toMatchObject({ code: "INVALID_TABLE" });
    }
    expect(await submitOrder(token, [{ productId: f.burger.id, quantity: 1 }])).toEqual({
      ok: false,
      error: "Estás enviando pedidos muy rápido. Espera un momento.",
      code: "RATE_LIMITED",
    });
    // otro token no se ve afectado
    expect(await submitOrder(`${token}x`, [{ productId: f.burger.id, quantity: 1 }])).toMatchObject({
      code: "INVALID_TABLE",
    });
  });
});

describe("getTableBill", () => {
  it("token inválido → INVALID_TABLE; mesa sin orden → order null", async () => {
    expect(await getTableBill("no-existe-este-token")).toMatchObject({ ok: false, code: "INVALID_TABLE" });
    const inactive = await newTable({ status: "INACTIVE" });
    expect(await getTableBill(inactive.publicToken)).toMatchObject({ ok: false, code: "INVALID_TABLE" });

    const t = await newTable();
    expect(await getTableBill(t.publicToken)).toEqual({
      ok: true,
      data: { table: { number: t.number }, order: null, currency: "COP" },
    });
  });

  it("orden abierta: ítems agrupados por ronda, totales vía computeBill y customerStatus", async () => {
    const t = await newTable();
    const r1 = await submitOrder(t.publicToken, [
      { productId: f.burger.id, quantity: 2 },
      { productId: f.soda.id, quantity: 1 },
    ]);
    await submitOrder(t.publicToken, [{ productId: f.soda.id, quantity: 3, notes: "Sin hielo" }]);
    if (!r1.ok) throw new Error("submit falló");

    // Cancelar una gaseosa de la ronda 1: no cuenta en los totales
    const sodaR1 = await db.orderItem.findFirstOrThrow({ where: { orderId: r1.data.orderId, round: 1, productId: f.soda.id } });
    await setItemStatus(sodaR1.id, "CANCELLED");

    const res = await getTableBill(t.publicToken);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.data.order) throw new Error("se esperaba orden");
    const d = res.data;
    expect(d.order!.id).toBe(r1.data.orderId);
    expect(d.order!.status).toBe("OPEN");
    expect(d.order!.version).toBe(3);
    expect(d.order!.rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(d.order!.rounds[0].items.map((i) => [i.productName, i.quantity, i.status])).toEqual([
      ["Hamburguesa", 2, "PENDING"],
      ["Gaseosa", 1, "CANCELLED"],
    ]);
    expect(d.order!.rounds[1].items).toEqual([
      expect.objectContaining({ productName: "Gaseosa", unitPrice: f.soda.price, quantity: 3, notes: "Sin hielo", status: "PENDING" }),
    ]);

    const subtotal = 2 * f.burger.price + 3 * f.soda.price;
    if (!("totals" in d)) throw new Error("faltan totales");
    expect(d.totals).toEqual({
      subtotal,
      taxAmount: subtotal - Math.round(subtotal / 1.19),
      tipAmount: Math.round(subtotal * 0.1),
      total: subtotal + Math.round(subtotal * 0.1),
      taxRate: 0.19,
      tipRate: 0.1,
      pricesIncludeTax: true,
    });
    expect(d.customerStatus).toBe("IN_PREPARATION");
    expect(d.currency).toBe("COP");
    // nada interno se filtra
    expect(JSON.stringify(d)).not.toContain(t.publicToken);
    expect(JSON.stringify(d)).not.toContain(f.waiterId);
  });

  it("tras cerrar: muestra la cuenta final (Bill) durante 2 h; después, order null", async () => {
    const t = await newTable();
    const r = await submitOrder(t.publicToken, [{ productId: f.burger.id, quantity: 1 }]);
    if (!r.ok) throw new Error("submit falló");
    const closed = await closeOrder(r.data.orderId, f.staffId, { tipRate: 0 });

    const res = await getTableBill(t.publicToken);
    if (!res.ok || !("totals" in res.data)) throw new Error("se esperaba la cuenta cerrada");
    expect(res.data.order.status).toBe("CLOSED");
    expect(res.data.customerStatus).toBe("CLOSED");
    expect(res.data.totals).toMatchObject({
      subtotal: closed.bill.subtotal,
      tipAmount: 0,
      total: closed.bill.total,
      tipRate: 0,
      taxRate: 0.19,
    });

    const later = new Date(Date.now() + CLOSED_BILL_WINDOW_MS + 60_000);
    expect(await getTableBillData(t.publicToken, later)).toEqual({
      table: { number: t.number },
      order: null,
      currency: "COP",
    });

    // Un pedido nuevo abre otra orden y pasa a ser la visible
    const r2 = await submitOrder(t.publicToken, [{ productId: f.soda.id, quantity: 1 }]);
    if (!r2.ok) throw new Error("submit falló");
    const res2 = await getTableBill(t.publicToken);
    expect(res2.ok && res2.data.order?.id).toBe(r2.data.orderId);
  });
});

describe("callWaiter", () => {
  it("marca la mesa NEEDS_ATTENTION y publica waiter.called al mesero y al salón", async () => {
    const t = await newTable();
    const waiter = collect(waiterChannel(f.waiterId));
    const floor = collect(FLOOR_CHANNEL);
    await ensureConnected();

    expect(await callWaiter(t.publicToken, "bill")).toEqual({ ok: true, data: { tableNumber: t.number } });
    expect((await db.table.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("NEEDS_ATTENTION");

    const mine = (get: () => BusMessage[]) => get().filter((m) => m.kind === "event" && m.payload.tableId === t.id);
    await waitFor(() => mine(waiter).length === 1 && mine(floor).length === 1);
    expect(mine(waiter)[0]).toEqual({
      kind: "event",
      event: "waiter.called",
      payload: { tableId: t.id, tableNumber: t.number },
    });
  });

  it("errores tipados y rate limit de 3 por minuto", async () => {
    expect(await callWaiter("no-existe-este-token", "assistance")).toMatchObject({ ok: false, code: "INVALID_TABLE" });
    const t = await newTable();
    // @ts-expect-error: motivo fuera del contrato
    expect(await callWaiter(t.publicToken, "pizza")).toMatchObject({ ok: false, code: "VALIDATION" });
    expect((await callWaiter(t.publicToken, "assistance")).ok).toBe(true);
    expect((await callWaiter(t.publicToken, "assistance")).ok).toBe(true);
    expect(await callWaiter(t.publicToken, "assistance")).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });
});
