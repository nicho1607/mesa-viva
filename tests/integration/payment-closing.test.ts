import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addItemsToOrderByTableId, closeOrder } from "@/lib/domain/orders";
import { staffCloseService } from "@/lib/domain/staff-table";
import { summarizeSales } from "@/lib/domain/sales";
import { getTableBillData } from "@/lib/domain/queries";
import type { ClosePayment } from "@/lib/payment-methods";

const tag = randomUUID();
let adminId = "", waiterId = "", outsiderId = "", zoneId = "", categoryId = "", productId = "";
const tables: string[] = [];
const transfer = (): ClosePayment => ({ paymentMethod: "TRANSFER", closeOperationId: randomUUID(), tipRate: 0.1 });

beforeAll(async () => {
  for (const [key, value] of Object.entries({ taxRate: "0.19", tipRate: "0.1", pricesIncludeTax: "true" })) {
    await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  const user = (name: string, role: "ADMIN" | "WAITER") => db.user.create({ data: { name, role, email: `${name}-${tag}@test.local`, passwordHash: "x" } });
  adminId = (await user("admin-pagos", "ADMIN")).id;
  waiterId = (await user("mesero-pagos", "WAITER")).id;
  outsiderId = (await user("otro-pagos", "WAITER")).id;
  zoneId = (await db.zone.create({ data: { name: tag, waiterId } })).id;
  categoryId = (await db.category.create({ data: { name: tag } })).id;
  productId = (await db.product.create({ data: { name: "Cuenta pagos", categoryId, price: 10_000_000 } })).id;
});

afterAll(async () => {
  const orders = { tableId: { in: tables } };
  await db.bill.deleteMany({ where: { order: orders } });
  await db.order.deleteMany({ where: orders });
  await db.table.deleteMany({ where: { id: { in: tables } } });
  await db.zone.deleteMany({ where: { id: zoneId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.user.deleteMany({ where: { id: { in: [adminId, waiterId, outsiderId] } } });
});

async function open() {
  const table = await db.table.create({ data: { zoneId, number: randomInt(10_000_000, 2_000_000_000), publicToken: randomUUID() } });
  tables.push(table.id);
  const order = await addItemsToOrderByTableId({ tableId: table.id, items: [{ productId, quantity: 1 }] });
  return { table, order };
}

it.each([
  { paymentMethod: "CASH", cashReceivedAmount: 12_000_000 },
  { paymentMethod: "TRANSFER" },
  { paymentMethod: "TRANSFER", tipRate: 0 },
  { paymentMethod: "MIXED", cashReceivedAmount: 2_000_000, mixedPayment: { cashAmount: 1_000_000, transferAmount: 10_000_000, tipCashAmount: 1_000_000, tipTransferAmount: 0 } },
  { paymentMethod: "MIXED", cashReceivedAmount: 600_000, mixedPayment: { cashAmount: 600_000, transferAmount: 10_400_000, tipCashAmount: 600_000, tipTransferAmount: 400_000 } },
] as const)("persiste y concilia %j sin filtrar datos internos", async (payment) => {
  const { table, order } = await open();
  const r = await closeOrder(order.orderId, adminId, { ...transfer(), ...payment });
  expect(r.bill.cashAmount! + r.bill.transferAmount!).toBe(r.bill.total);
  expect(r.bill.tipCashAmount! + r.bill.tipTransferAmount!).toBe(r.bill.tipAmount);
  expect((await db.table.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("AVAILABLE");
  const summary = summarizeSales([r.bill]);
  expect(summary).toMatchObject({ total: r.bill.total, tipCash: r.bill.tipCashAmount, tipTransfer: r.bill.tipTransferAmount, unknownTipCount: 0 });
  const publicView = JSON.stringify(await getTableBillData(table.publicToken));
  for (const field of ["cashReceivedAmount", "closeOperationId", "closeRequestHash"]) expect(publicView).not.toContain(field);
});

it("serializa doble envío y recupera el mismo cierre aun con Setting modificado", async () => {
  const { order } = await open();
  const payment = transfer();
  const results = await Promise.all([closeOrder(order.orderId, adminId, payment), closeOrder(order.orderId, adminId, payment)]);
  expect(results.map((r) => r.changed).sort()).toEqual([false, true]);
  expect(results[0].bill.id).toBe(results[1].bill.id);
  expect(results[0].version).toBe(results[1].version);
  await db.setting.update({ where: { key: "taxRate" }, data: { value: "0.05" } });
  try {
    expect((await closeOrder(order.orderId, adminId, payment)).bill).toEqual(results[0].bill);
  } finally { await db.setting.update({ where: { key: "taxRate" }, data: { value: "0.19" } }); }
  await expect(closeOrder(order.orderId, adminId, { ...payment, tipRate: 0 })).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(closeOrder(order.orderId, adminId, transfer())).rejects.toMatchObject({ code: "ORDER_CLOSED" });
  const next = await open();
  await expect(closeOrder(next.order.orderId, adminId, payment)).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await db.bill.count({ where: { orderId: order.orderId } })).toBe(1);
});

it("autoriza contra BD bajo bloqueo y permite recuperar al mesero de la orden cerrada", async () => {
  const { order, table } = await open();
  const raw = { orderId: order.orderId, ...transfer() };
  await expect(staffCloseService({ id: outsiderId, role: "ADMIN" }, raw)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await db.table.update({ where: { id: table.id }, data: { waiterId: outsiderId } });
  const first = await staffCloseService({ id: waiterId, role: "WAITER" }, raw);
  expect((await staffCloseService({ id: waiterId, role: "WAITER" }, raw)).bill.id).toBe(first.bill.id);
  await db.user.update({ where: { id: waiterId }, data: { active: false } });
  try { await expect(staffCloseService({ id: waiterId, role: "WAITER" }, raw)).rejects.toMatchObject({ code: "FORBIDDEN" }); }
  finally { await db.user.update({ where: { id: waiterId }, data: { active: true } }); }
});

it("rechaza importes inválidos sin crear Bill y la BD impide romper la conciliación", async () => {
  const { order, table } = await open();
  await expect(closeOrder(order.orderId, adminId, { ...transfer(), paymentMethod: "CASH", cashReceivedAmount: 10_000_000 })).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await db.bill.count({ where: { orderId: order.orderId } })).toBe(0);
  expect((await db.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe("OPEN");
  expect((await db.table.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("OCCUPIED");
  const { bill } = await closeOrder(order.orderId, adminId, transfer());
  await expect(db.bill.update({ where: { id: bill.id }, data: { tipCashAmount: 1 } })).rejects.toThrow();
  await expect(db.bill.update({ where: { id: bill.id }, data: { tipTransferAmount: null } })).rejects.toThrow();
  await expect(db.bill.update({ where: { id: bill.id }, data: { cashReceivedAmount: 1 } })).rejects.toThrow();
});

it("revierte Bill si falla el cierre después de insertarla", async () => {
  const { order, table } = await open();
  const trigger = `payment_failure_${tag.replaceAll("-", "")}`;
  await db.$executeRawUnsafe(`CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${order.orderId}' THEN RAISE EXCEPTION 'fallo inducido'; END IF; RETURN NEW; END $$`);
  try {
    await db.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION "${trigger}"()`);
    await expect(closeOrder(order.orderId, adminId, transfer())).rejects.toThrow();
    expect(await db.bill.count({ where: { orderId: order.orderId } })).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe("OPEN");
    expect((await db.table.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("OCCUPIED");
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "Order"`);
    await db.$executeRawUnsafe(`DROP FUNCTION "${trigger}"()`);
  }
});
