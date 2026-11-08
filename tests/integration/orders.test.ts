import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  InvalidTableError,
  InvalidTransitionError,
  NotFoundError,
  OrderClosedError,
  UnavailableProductsError,
} from "@/lib/domain/errors";
import {
  addItemsToOrder,
  addItemsToOrderByTableId,
  cancelItem,
  closeOrder,
  confirmRound,
  setItemStatus,
} from "@/lib/domain/orders";

// Fixtures propios con sufijo aleatorio; se borran al final.
const tag = randomBytes(4).toString("hex");
const f = {
  waiterId: "",
  staffId: "",
  zoneId: "",
  categoryId: "",
  burger: { id: "", price: 25_000_00 },
  soda: { id: "", price: 6_000_00 },
  soldOut: { id: "" },
  tableIds: [] as string[],
};
let tableCounter = 0;

it("un envío espera el bloqueo de mesa y rechaza la desactivación concurrente", async () => {
  const table = await newTable();
  let pending: Promise<unknown> | undefined;
  await db.$transaction(async (tx) => {
    await tx.table.update({ where: { id: table.id }, data: { status: "INACTIVE" } });
    pending = addItemsToOrder({ token: table.publicToken, items: [{ productId: f.burger.id, quantity: 1 }] })
      .catch((e: unknown) => e);
    await vi.waitFor(async () => {
      const rows = await tx.$queryRaw<{ waiting: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE 'SELECT id FROM "Table" WHERE "publicToken"%') AS waiting`;
      expect(rows[0].waiting).toBe(true);
    }, { timeout: 3000 });
  });
  expect(await pending).toBeInstanceOf(InvalidTableError);
  expect(await db.order.count({ where: { tableId: table.id } })).toBe(0);
  expect((await db.table.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("INACTIVE");
});

async function newTable(status: "AVAILABLE" | "INACTIVE" = "AVAILABLE") {
  tableCounter++;
  const table = await db.table.create({
    data: {
      number: 900_000 + (parseInt(tag, 16) % 90_000) * 10 + tableCounter,
      publicToken: `t${tag}${randomBytes(10).toString("hex")}`,
      zoneId: f.zoneId,
      status,
    },
  });
  f.tableIds.push(table.id);
  return table;
}

beforeAll(async () => {
  const [waiter, staff] = await Promise.all([
    db.user.create({ data: { name: "Mesero test", email: `mesero-${tag}@test.local`, passwordHash: "x" } }),
    db.user.create({ data: { name: "Admin test", email: `admin-${tag}@test.local`, passwordHash: "x", role: "ADMIN" } }),
  ]);
  f.waiterId = waiter.id;
  f.staffId = staff.id;
  f.zoneId = (await db.zone.create({ data: { name: `Zona ${tag}`, waiterId: waiter.id } })).id;
  f.categoryId = (await db.category.create({ data: { name: `Categoría ${tag}` } })).id;
  const mk = (name: string, price: number, available = true) =>
    db.product.create({ data: { name, price, available, categoryId: f.categoryId } });
  f.burger.id = (await mk("Hamburguesa", f.burger.price)).id;
  f.soda.id = (await mk("Gaseosa", f.soda.price)).id;
  f.soldOut.id = (await mk("Agotado", 1_000_00, false)).id;
});

beforeEach(async () => {
  // Config conocida para el cálculo de la cuenta
  const settings = { taxRate: "0.19", tipRate: "0.10", pricesIncludeTax: "true" };
  for (const [key, value] of Object.entries(settings)) {
    await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
});

afterAll(async () => {
  const orders = await db.order.findMany({ where: { tableId: { in: f.tableIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await db.bill.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.table.deleteMany({ where: { id: { in: f.tableIds } } });
  await db.zone.deleteMany({ where: { id: f.zoneId } });
  await db.product.deleteMany({ where: { categoryId: f.categoryId } });
  await db.category.deleteMany({ where: { id: f.categoryId } });
  await db.user.deleteMany({ where: { id: { in: [f.waiterId, f.staffId] } } });
  await db.$disconnect();
});

describe("addItemsToOrder", () => {
  it("crea la orden con ronda 1, asigna mesero de la zona y ocupa la mesa", async () => {
    const table = await newTable();
    const r = await addItemsToOrder({
      token: table.publicToken,
      items: [{ productId: f.burger.id, quantity: 2, notes: "  Sin cebolla " }],
    });
    expect(r).toMatchObject({ tableId: table.id, tableNumber: table.number, waiterId: f.waiterId, round: 1, isNew: true, version: 1 });

    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { items: true } });
    expect(order.status).toBe("OPEN");
    expect(order.lastRound).toBe(1);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ round: 1, quantity: 2, status: "PENDING", notes: "Sin cebolla", productName: "Hamburguesa" });
    expect((await db.table.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("OCCUPIED");
  });

  it("reutiliza la orden abierta y crea la ronda 2", async () => {
    const table = await newTable();
    const r1 = await addItemsToOrder({ token: table.publicToken, items: [{ productId: f.burger.id, quantity: 1 }] });
    const r2 = await addItemsToOrder({ token: table.publicToken, items: [{ productId: f.soda.id, quantity: 3 }] });
    expect(r2.orderId).toBe(r1.orderId);
    expect(r2).toMatchObject({ round: 2, isNew: false, version: 2 });
    expect(await db.order.count({ where: { tableId: table.id } })).toBe(1);
  });

  it("toma los precios de la BD e ignora cualquier precio enviado", async () => {
    const table = await newTable();
    const r = await addItemsToOrder({
      token: table.publicToken,
      items: [{ productId: f.burger.id, quantity: 1, unitPrice: 1, price: 1 }],
    });
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: r.orderId } });
    expect(item.unitPrice).toBe(f.burger.price);
  });

  it("rechaza productos agotados o inexistentes con sus ids y no crea nada", async () => {
    const table = await newTable();
    const ghost = randomUUID();
    const err = await addItemsToOrder({
      token: table.publicToken,
      items: [
        { productId: f.burger.id, quantity: 1 },
        { productId: f.soldOut.id, quantity: 1 },
        { productId: ghost, quantity: 1 },
      ],
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnavailableProductsError);
    expect((err as UnavailableProductsError).productIds.sort()).toEqual([f.soldOut.id, ghost].sort());
    expect(await db.order.count({ where: { tableId: table.id } })).toBe(0);
  });

  it("rechaza token inexistente y mesa inactiva", async () => {
    const inactive = await newTable("INACTIVE");
    await expect(
      addItemsToOrder({ token: "no-existe-este-token-123", items: [{ productId: f.burger.id, quantity: 1 }] }),
    ).rejects.toBeInstanceOf(InvalidTableError);
    await expect(
      addItemsToOrder({ token: inactive.publicToken, items: [{ productId: f.burger.id, quantity: 1 }] }),
    ).rejects.toBeInstanceOf(InvalidTableError);
  });

  it("valida la entrada (cantidad fuera de rango, lista vacía)", async () => {
    const table = await newTable();
    await expect(addItemsToOrder({ token: table.publicToken, items: [] })).rejects.toThrow();
    await expect(
      addItemsToOrder({ token: table.publicToken, items: [{ productId: f.burger.id, quantity: 0 }] }),
    ).rejects.toThrow();
  });

  it("variante por tableId (mesero) comparte el mismo núcleo", async () => {
    const table = await newTable();
    const r1 = await addItemsToOrder({ token: table.publicToken, items: [{ productId: f.burger.id, quantity: 1 }] });
    const r2 = await addItemsToOrderByTableId({ tableId: table.id, items: [{ productId: f.soda.id, quantity: 1 }] });
    expect(r2).toMatchObject({ orderId: r1.orderId, round: 2, isNew: false });
  });

  it("concurrencia: dos envíos simultáneos sin orden → una sola orden OPEN con rondas 1 y 2", async () => {
    const table = await newTable();
    const send = () => addItemsToOrder({ token: table.publicToken, items: [{ productId: f.burger.id, quantity: 1 }] });
    const results = await Promise.all([send(), send()]);

    expect(new Set(results.map((r) => r.orderId)).size).toBe(1);
    expect(results.map((r) => r.round).sort()).toEqual([1, 2]);
    expect(results.filter((r) => r.isNew)).toHaveLength(1);
    expect(await db.order.count({ where: { tableId: table.id, status: "OPEN" } })).toBe(1);
    const order = await db.order.findUniqueOrThrow({ where: { id: results[0].orderId } });
    expect(order).toMatchObject({ lastRound: 2, version: 2 });
  });

  it("concurrencia (5 envíos): el choque con el índice único se reintenta → una orden, rondas 1..5", async () => {
    const table = await newTable();
    const send = () => addItemsToOrder({ token: table.publicToken, items: [{ productId: f.soda.id, quantity: 1 }] });
    const results = await Promise.all(Array.from({ length: 5 }, send));

    expect(new Set(results.map((r) => r.orderId)).size).toBe(1);
    expect(results.map((r) => r.round).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(await db.order.count({ where: { tableId: table.id } })).toBe(1);
    expect(await db.orderItem.count({ where: { orderId: results[0].orderId } })).toBe(5);
  });

  it("orden cerrada es inmutable y el siguiente envío abre una orden nueva", async () => {
    const table = await newTable();
    const r = await addItemsToOrder({ token: table.publicToken, items: [{ productId: f.burger.id, quantity: 1 }] });
    await closeOrder(r.orderId, f.staffId);
    // Tras el cierre, el siguiente escaneo abre una orden nueva (no reabre la cerrada)
    const next = await addItemsToOrder({ token: table.publicToken, items: [{ productId: f.soda.id, quantity: 1 }] });
    expect(next.orderId).not.toBe(r.orderId);
    expect(next).toMatchObject({ isNew: true, round: 1 });
    // Las mutaciones directas sobre la orden cerrada se rechazan
    await expect(confirmRound(r.orderId, 1)).rejects.toBeInstanceOf(OrderClosedError);
    await expect(closeOrder(r.orderId, f.staffId)).rejects.toBeInstanceOf(OrderClosedError);
  });

  it("si closeOrder gana el bloqueo, addItems concurrente ve CLOSED o abre una orden nueva, nunca escribe en la cerrada", async () => {
    const table = await newTable();
    const r = await addItemsToOrder({ token: table.publicToken, items: [{ productId: f.burger.id, quantity: 1 }] });
    const [closed, added] = await Promise.allSettled([
      closeOrder(r.orderId, f.staffId),
      addItemsToOrder({ token: table.publicToken, items: [{ productId: f.soda.id, quantity: 1 }] }),
    ]);
    expect(closed.status).toBe("fulfilled");
    if (added.status === "rejected") {
      expect(added.reason).toBeInstanceOf(OrderClosedError);
    } else if (added.value.orderId === r.orderId) {
      // addItems entró antes del cierre: la cuenta debe incluir su ronda
      const bill = await db.bill.findUniqueOrThrow({ where: { orderId: r.orderId } });
      expect(bill.subtotal).toBe(f.burger.price + f.soda.price);
    }
    const closedItems = await db.orderItem.findMany({ where: { orderId: r.orderId } });
    const bill = await db.bill.findUniqueOrThrow({ where: { orderId: r.orderId } });
    expect(bill.subtotal).toBe(closedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
  });
});

describe("acciones del mesero", () => {
  it("confirmRound pasa los PENDING de esa ronda a IN_PREPARATION y sube version", async () => {
    const table = await newTable();
    const r1 = await addItemsToOrder({ token: table.publicToken, items: [{ productId: f.burger.id, quantity: 1 }] });
    await addItemsToOrder({ token: table.publicToken, items: [{ productId: f.soda.id, quantity: 1 }] });

    const c = await confirmRound(r1.orderId, 1);
    expect(c).toMatchObject({ orderId: r1.orderId, round: 1, count: 1, version: 3, tableId: table.id, waiterId: f.waiterId });
    const items = await db.orderItem.findMany({ where: { orderId: r1.orderId }, orderBy: { round: "asc" } });
    expect(items.map((i) => i.status)).toEqual(["IN_PREPARATION", "PENDING"]);
  });

  it("setItemStatus respeta transiciones, fija servedAt y sube version", async () => {
    const table = await newTable();
    const r = await addItemsToOrder({ token: table.publicToken, items: [{ productId: f.burger.id, quantity: 1 }] });
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: r.orderId } });

    await expect(setItemStatus(item.id, "SERVED")).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(setItemStatus(item.id, "PENDING")).rejects.toBeInstanceOf(InvalidTransitionError);

    const a = await setItemStatus(item.id, "IN_PREPARATION");
    const b = await setItemStatus(item.id, "SERVED");
    expect(b.version).toBe(a.version + 1);
    const served = await db.orderItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(served.status).toBe("SERVED");
    expect(served.servedAt).toBeInstanceOf(Date);

    await expect(cancelItem(item.id)).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(setItemStatus(item.id, "IN_PREPARATION")).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(setItemStatus(randomUUID(), "SERVED")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cancelItem cancela ítems no servidos y no cuentan en la cuenta", async () => {
    const table = await newTable();
    const r = await addItemsToOrder({
      token: table.publicToken,
      items: [
        { productId: f.burger.id, quantity: 1 },
        { productId: f.soda.id, quantity: 1 },
      ],
    });
    const soda = await db.orderItem.findFirstOrThrow({ where: { orderId: r.orderId, productId: f.soda.id } });
    const c = await cancelItem(soda.id);
    expect(c).toMatchObject({ itemId: soda.id, status: "CANCELLED", version: 2 });
    await expect(cancelItem(soda.id)).rejects.toBeInstanceOf(InvalidTransitionError);

    const { bill } = await closeOrder(r.orderId, f.staffId);
    expect(bill.subtotal).toBe(f.burger.price);
    // Mutaciones de ítems sobre orden cerrada
    const burger = await db.orderItem.findFirstOrThrow({ where: { orderId: r.orderId, productId: f.burger.id } });
    await expect(setItemStatus(burger.id, "IN_PREPARATION")).rejects.toBeInstanceOf(OrderClosedError);
  });
});

describe("closeOrder", () => {
  it("crea la Bill con totales correctos y líneas agrupadas, cierra la orden y libera la mesa", async () => {
    const table = await newTable();
    const r = await addItemsToOrder({
      token: table.publicToken,
      items: [
        { productId: f.burger.id, quantity: 1 },
        { productId: f.burger.id, quantity: 1, notes: "Sin cebolla" },
        { productId: f.soda.id, quantity: 2 },
      ],
    });
    await addItemsToOrder({ token: table.publicToken, items: [{ productId: f.burger.id, quantity: 1 }] });
    const before = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });

    const res = await closeOrder(r.orderId, f.staffId);
    // subtotal = 3 × 25.000 + 2 × 6.000 = 87.000 COP (en centavos), IVA incluido 19 %, propina 10 %
    const subtotal = 3 * f.burger.price + 2 * f.soda.price;
    const taxAmount = subtotal - Math.round(subtotal / 1.19);
    const tipAmount = Math.round(subtotal * 0.1);
    expect(res.bill).toMatchObject({ subtotal, taxAmount, tipAmount, total: subtotal + tipAmount, closedById: f.staffId });
    expect(Number(res.bill.taxRate)).toBe(0.19);
    expect(Number(res.bill.tipRate)).toBe(0.1);
    expect(res).toMatchObject({ orderId: r.orderId, tableId: table.id, tableNumber: table.number, version: before.version + 1, unservedCount: 4 });

    const lines = res.bill.lines as { productId: string; quantity: number; notes: string | null; lineTotal: number }[];
    expect(lines).toEqual([
      expect.objectContaining({ productId: f.burger.id, quantity: 2, notes: null, lineTotal: 2 * f.burger.price }),
      expect.objectContaining({ productId: f.burger.id, quantity: 1, notes: "Sin cebolla" }),
      expect.objectContaining({ productId: f.soda.id, quantity: 2, lineTotal: 2 * f.soda.price }),
    ]);

    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    expect(order.status).toBe("CLOSED");
    expect(order.closedAt).toBeInstanceOf(Date);
    expect((await db.table.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("AVAILABLE");
  });

  it("usa la propina de Setting y permite sobrescribirla", async () => {
    await db.setting.update({ where: { key: "tipRate" }, data: { value: "0.15" } });
    const t1 = await newTable();
    const r1 = await addItemsToOrder({ token: t1.publicToken, items: [{ productId: f.soda.id, quantity: 1 }] });
    expect((await closeOrder(r1.orderId, f.staffId)).bill.tipAmount).toBe(Math.round(f.soda.price * 0.15));

    const t2 = await newTable();
    const r2 = await addItemsToOrder({ token: t2.publicToken, items: [{ productId: f.soda.id, quantity: 1 }] });
    const { bill } = await closeOrder(r2.orderId, f.staffId, { tipRate: 0 });
    expect(bill).toMatchObject({ tipAmount: 0, total: f.soda.price });
    await expect(closeOrder(r2.orderId, f.staffId, { tipRate: 2 })).rejects.toBeInstanceOf(RangeError);
  });

  it("orden inexistente → NotFoundError", async () => {
    await expect(closeOrder(randomUUID(), f.staffId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
