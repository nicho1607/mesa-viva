import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as admin from "@/lib/domain/admin";
import { ConflictError, InsufficientStockError, UnavailableProductsError } from "@/lib/domain/errors";
import { addItemsToOrder, cancelItem, confirmRound } from "@/lib/domain/orders";
import { getMenuData } from "@/lib/domain/queries";

const tag = randomBytes(4).toString("hex");
const actor = { id: "", role: "ADMIN" };
const fixture = { zoneId: "", categoryId: "", productIds: [] as string[], tableIds: [] as string[] };
let tableNo = 970_000 + (parseInt(tag, 16) % 2_000) * 10;

async function product(quantity: number, available = true) {
  const p = await db.product.create({
    data: { name: `Inventario ${tag} ${fixture.productIds.length}`, price: 10_000_00, available, categoryId: fixture.categoryId },
  });
  fixture.productIds.push(p.id);
  await admin.openProductInventory(actor, { id: p.id, quantity, operationId: randomUUID() });
  return p.id;
}

async function table() {
  tableNo++;
  const t = await db.table.create({
    data: { number: tableNo, publicToken: `inv-${tag}-${randomBytes(10).toString("hex")}`, zoneId: fixture.zoneId },
  });
  fixture.tableIds.push(t.id);
  return t;
}

beforeAll(async () => {
  actor.id = (await db.user.create({
    data: { name: `Admin inventario ${tag}`, email: `inv-${tag}@test.local`, passwordHash: "x", role: "ADMIN" },
  })).id;
  fixture.zoneId = (await db.zone.create({ data: { name: `Inventario ${tag}` } })).id;
  fixture.categoryId = (await db.category.create({ data: { name: `Inventario ${tag}` } })).id;
});

afterAll(async () => {
  const orders = await db.order.findMany({ where: { tableId: { in: fixture.tableIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await db.bill.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.inventoryMovement.deleteMany({ where: { productId: { in: fixture.productIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.table.deleteMany({ where: { id: { in: fixture.tableIds } } });
  await db.product.deleteMany({ where: { id: { in: fixture.productIds } } });
  await db.category.delete({ where: { id: fixture.categoryId } });
  await db.zone.delete({ where: { id: fixture.zoneId } });
  await db.user.delete({ where: { id: actor.id } });
});

describe("reservas de porciones", () => {
  it("reserva al aceptar y rechaza sin efectos cuando no alcanza", async () => {
    const p = await product(5);
    const t = await table();
    const accepted = await addItemsToOrder({
      token: t.publicToken,
      operationId: randomUUID(),
      items: [{ productId: p, quantity: 3 }],
    });
    expect((await db.product.findUniqueOrThrow({ where: { id: p } })).availableQuantity).toBe(2);
    const movements = await db.inventoryMovement.findMany({ where: { productId: p }, orderBy: { createdAt: "asc" } });
    expect(movements.reduce((sum, movement) => sum + movement.delta, 0)).toBe(2);
    for (let i = 1; i < movements.length; i++) {
      expect(movements[i].balanceBefore).toBe(movements[i - 1].balanceAfter);
    }
    expect(await db.inventoryMovement.findFirst({
      where: { productId: p, submissionId: { not: null } },
      select: { delta: true, balanceBefore: true, balanceAfter: true },
    })).toEqual({ delta: -3, balanceBefore: 5, balanceAfter: 2 });

    const err = await addItemsToOrder({
      token: t.publicToken,
      operationId: randomUUID(),
      items: [{ productId: p, quantity: 3 }],
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InsufficientStockError);
    expect((err as InsufficientStockError).shortages).toEqual([{ productId: p, requested: 3, available: 2 }]);
    expect((await db.product.findUniqueOrThrow({ where: { id: p } })).availableQuantity).toBe(2);
    expect((await db.order.findUniqueOrThrow({ where: { id: accepted.orderId } })).lastRound).toBe(1);
  });

  it("agrupa notas y revierte todo el carrito si un producto es insuficiente", async () => {
    const scarce = await product(3);
    const ample = await product(10);
    const t = await table();
    await expect(addItemsToOrder({
      token: t.publicToken,
      operationId: randomUUID(),
      items: [
        { productId: scarce, quantity: 2 },
        { productId: scarce, quantity: 2, notes: "Sin cebolla" },
        { productId: ample, quantity: 1 },
      ],
    })).rejects.toBeInstanceOf(InsufficientStockError);
    expect((await db.product.findUniqueOrThrow({ where: { id: scarce } })).availableQuantity).toBe(3);
    expect((await db.product.findUniqueOrThrow({ where: { id: ample } })).availableQuantity).toBe(10);
    expect(await db.order.count({ where: { tableId: t.id } })).toBe(0);
  });

  it("conserva el comportamiento anterior para productos sin control", async () => {
    const p = await db.product.create({
      data: { name: `Sin control ${tag}`, price: 2_000_00, categoryId: fixture.categoryId },
    });
    fixture.productIds.push(p.id);
    const t = await table();
    await expect(addItemsToOrder({ token: t.publicToken, items: [{ productId: p.id, quantity: 20 }] })).resolves.toBeTruthy();
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).availableQuantity).toBeNull();
    expect(await db.inventoryMovement.count({ where: { productId: p.id } })).toBe(0);
  });

  it("dos mesas por la última unidad: acepta exactamente una", async () => {
    const p = await product(1);
    const [a, b] = await Promise.all([table(), table()]);
    const results = await Promise.allSettled([a, b].map((t) => addItemsToOrder({
      token: t.publicToken,
      operationId: randomUUID(),
      items: [{ productId: p, quantity: 1 }],
    })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toBeInstanceOf(InsufficientStockError);
    expect((await db.product.findUniqueOrThrow({ where: { id: p } })).availableQuantity).toBe(0);
    expect((await getMenuData()).flatMap((category) => category.products).find((item) => item.id === p)?.available).toBe(false);
    expect(await db.inventoryMovement.count({ where: { productId: p, type: "RESERVATION" } })).toBe(1);
  });
});

describe("idempotencia y cancelación conservadora", () => {
  it("el mismo identificador devuelve la misma ronda y reserva una sola vez", async () => {
    const p = await product(5);
    const t = await table();
    const operationId = randomUUID();
    const input = { token: t.publicToken, operationId, items: [{ productId: p, quantity: 2 }] };
    const [first, replay] = await Promise.all([addItemsToOrder(input), addItemsToOrder(input)]);
    expect(replay).toMatchObject({ orderId: first.orderId, round: first.round, version: first.version });
    expect((await db.product.findUniqueOrThrow({ where: { id: p } })).availableQuantity).toBe(3);
    expect(await db.inventoryMovement.count({ where: { productId: p, type: "RESERVATION" } })).toBe(1);
    await expect(addItemsToOrder({ ...input, items: [{ productId: p, quantity: 1 }] })).rejects.toBeInstanceOf(ConflictError);
  });

  it("cancelar pendiente o en preparación y reintentar no libera porciones", async () => {
    const p = await product(5);
    const t = await table();
    const r = await addItemsToOrder({
      token: t.publicToken,
      items: [
        { productId: p, quantity: 1, notes: "Primero" },
        { productId: p, quantity: 1, notes: "Segundo" },
      ],
    });
    const items = await db.orderItem.findMany({ where: { orderId: r.orderId }, orderBy: { notes: "asc" } });
    expect((await cancelItem(items[0].id)).changed).toBe(true);
    await confirmRound(r.orderId, 1);
    expect((await cancelItem(items[1].id)).changed).toBe(true);
    expect((await cancelItem(items[1].id)).changed).toBe(false);
    expect((await db.product.findUniqueOrThrow({ where: { id: p } })).availableQuantity).toBe(3);
  });
});

describe("ajustes de ADMIN", () => {
  it("el control manual no borra ni repone el saldo", async () => {
    const p = await product(2);
    const t = await table();
    await admin.setProductAvailable(actor, { id: p, available: "false" });
    await expect(addItemsToOrder({ token: t.publicToken, items: [{ productId: p, quantity: 1 }] }))
      .rejects.toBeInstanceOf(UnavailableProductsError);
    expect((await db.product.findUniqueOrThrow({ where: { id: p } })).availableQuantity).toBe(2);
    await admin.setProductAvailable(actor, { id: p, available: "true" });
    await expect(addItemsToOrder({ token: t.publicToken, items: [{ productId: p, quantity: 1 }] })).resolves.toBeTruthy();
    expect((await db.product.findUniqueOrThrow({ where: { id: p } })).availableQuantity).toBe(1);
  });

  it("aplica un ajuste una sola vez y rechaza saldo negativo", async () => {
    const p = await product(2);
    const operationId = randomUUID();
    const input = { id: p, delta: 5, reason: "Reposición de cocina", operationId };
    const [first, replay] = await Promise.all([
      admin.adjustProductInventory(actor, input),
      admin.adjustProductInventory(actor, input),
    ]);
    expect(first.availableQuantity).toBe(7);
    expect(replay.availableQuantity).toBe(7);
    expect(await db.inventoryMovement.count({ where: { productId: p, operationId } })).toBe(1);
    await expect(admin.adjustProductInventory(actor, {
      id: p, delta: -8, reason: "Conteo", operationId: randomUUID(),
    })).rejects.toBeInstanceOf(ConflictError);
    expect((await db.product.findUniqueOrThrow({ where: { id: p } })).availableQuantity).toBe(7);
    await expect(db.product.update({ where: { id: p }, data: { availableQuantity: -1 } })).rejects.toThrow();
  });

  it("solo ADMIN puede abrir o ajustar inventario", async () => {
    const p = await db.product.create({
      data: { name: `Sin abrir ${tag}`, price: 1_000_00, categoryId: fixture.categoryId },
    });
    fixture.productIds.push(p.id);
    const waiter = { id: randomUUID(), role: "WAITER" };
    await expect(admin.openProductInventory(waiter, {
      id: p.id, quantity: 2, operationId: randomUUID(),
    })).rejects.toThrow(/administrador/);
    await admin.openProductInventory(actor, { id: p.id, quantity: 2, operationId: randomUUID() });
    await expect(admin.adjustProductInventory(waiter, {
      id: p.id, delta: 1, reason: "Reposición", operationId: randomUUID(),
    })).rejects.toThrow(/administrador/);
  });
});
