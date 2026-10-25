// Plano de mesas (getFloorForStaff), motivo de la llamada y "Atendido" (acknowledgeTable).
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getFloorForStaff, type FloorTable } from "@/lib/domain/floor";
import { addItemsToOrderByTableId, closeOrder, setItemStatus } from "@/lib/domain/orders";
import { acknowledgeTable, requestWaiter } from "@/lib/domain/tables";

const tag = randomBytes(4).toString("hex");
const base = 700_000 + (parseInt(tag, 16) % 90_000) * 10;
const f = {
  ana: "", // mesera de la zona A
  beto: "", // mesero de la zona B
  admin: "",
  zoneA: "",
  zoneB: "",
  productId: "",
  t1: { id: "", token: "", number: base + 1 }, // zona A, sin asignación directa → Ana
  t2: { id: "", token: "", number: base + 2 }, // zona A, asignada directo a Beto → Beto
  t3: { id: "", token: "", number: base + 3 }, // zona B → Beto
  t4: { id: "", token: "", number: base + 4 }, // zona B, asignada directo a Ana → Ana
  t5: { id: "", token: "", number: base + 5 }, // zona A, INACTIVE → nadie
};

const ids = (tables: FloorTable[]) => tables.map((t) => t.number);
const mine = (zones: Awaited<ReturnType<typeof getFloorForStaff>>) =>
  zones.flatMap((z) => z.tables).filter((t) => t.number >= base && t.number < base + 10);

beforeAll(async () => {
  const mkUser = (name: string, role: "WAITER" | "ADMIN" = "WAITER") =>
    db.user.create({ data: { name, email: `${name}-${tag}@test.local`, passwordHash: "x", role } });
  const [ana, beto, admin] = await Promise.all([mkUser("ana"), mkUser("beto"), mkUser("admin", "ADMIN")]);
  f.ana = ana.id;
  f.beto = beto.id;
  f.admin = admin.id;
  f.zoneA = (await db.zone.create({ data: { name: `A floor ${tag}`, waiterId: ana.id } })).id;
  f.zoneB = (await db.zone.create({ data: { name: `B floor ${tag}`, waiterId: beto.id } })).id;
  const cat = await db.category.create({ data: { name: `floor ${tag}` } });
  f.productId = (await db.product.create({ data: { name: "Arepa", price: 8_000_00, categoryId: cat.id } })).id;

  const mk = async (
    t: { id: string; token: string; number: number },
    zoneId: string,
    waiterId: string | null,
    status: "AVAILABLE" | "INACTIVE" = "AVAILABLE",
  ) => {
    t.token = `f${tag}${randomBytes(10).toString("hex")}`;
    t.id = (await db.table.create({ data: { number: t.number, publicToken: t.token, zoneId, waiterId, status } })).id;
  };
  await mk(f.t1, f.zoneA, null);
  await mk(f.t2, f.zoneA, beto.id);
  await mk(f.t3, f.zoneB, null);
  await mk(f.t4, f.zoneB, ana.id);
  await mk(f.t5, f.zoneA, null, "INACTIVE");
});

afterAll(async () => {
  const tableIds = [f.t1, f.t2, f.t3, f.t4, f.t5].map((t) => t.id);
  const orders = await db.order.findMany({ where: { tableId: { in: tableIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await db.bill.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.table.deleteMany({ where: { id: { in: tableIds } } });
  await db.zone.deleteMany({ where: { id: { in: [f.zoneA, f.zoneB] } } });
  await db.product.deleteMany({ where: { id: f.productId } });
  await db.category.deleteMany({ where: { name: `floor ${tag}` } });
  await db.user.deleteMany({ where: { id: { in: [f.ana, f.beto, f.admin] } } });
});

describe("getFloorForStaff", () => {
  it("mesero: mesas asignadas directo + las de su zona sin asignación directa", async () => {
    const ana = await getFloorForStaff({ id: f.ana, role: "WAITER" });
    expect(ids(mine(ana))).toEqual([f.t1.number, f.t4.number]);
    const beto = await getFloorForStaff({ id: f.beto, role: "WAITER" });
    expect(ids(mine(beto))).toEqual([f.t2.number, f.t3.number]);
  });

  it("admin y caja ven todas (sin INACTIVE), agrupadas por zona y ordenadas por número", async () => {
    for (const role of ["ADMIN", "CASHIER"]) {
      const zones = (await getFloorForStaff({ id: f.admin, role })).filter((z) => z.name.endsWith(tag));
      expect(zones.map((z) => z.name)).toEqual([`A floor ${tag}`, `B floor ${tag}`]);
      expect(ids(zones[0].tables)).toEqual([f.t1.number, f.t2.number]);
      expect(ids(zones[1].tables)).toEqual([f.t3.number, f.t4.number]);
    }
  });

  it("resume la orden abierta: contadores por estado, ronda, subtotal sin cancelados", async () => {
    await addItemsToOrderByTableId({ tableId: f.t1.id, items: [{ productId: f.productId, quantity: 2 }] });
    const r2 = await addItemsToOrderByTableId({
      tableId: f.t1.id,
      items: [
        { productId: f.productId, quantity: 1 },
        { productId: f.productId, quantity: 1, notes: "sin queso" },
      ],
    });
    const items = await db.orderItem.findMany({ where: { orderId: r2.orderId }, orderBy: { createdAt: "asc" } });
    await setItemStatus(items[0].id, "IN_PREPARATION");
    await setItemStatus(items[0].id, "SERVED");
    await setItemStatus(items[1].id, "CANCELLED");

    const t = mine(await getFloorForStaff({ id: f.ana, role: "WAITER" })).find((x) => x.id === f.t1.id)!;
    expect(t).toMatchObject({ status: "OCCUPIED", attentionReason: null, seats: 4, zoneName: `A floor ${tag}` });
    expect(t.order).toMatchObject({ id: r2.orderId, pendingCount: 1, inPrepCount: 0, servedCount: 1, lastRound: 2 });
    expect(t.order!.subtotal).toBe(8_000_00 * 3); // 2 + 1 servido; el cancelado no suma
    expect(new Date(t.order!.openedAt).getTime()).toBeGreaterThan(0);

    const free = mine(await getFloorForStaff({ id: f.ana, role: "WAITER" })).find((x) => x.id === f.t4.id)!;
    expect(free).toMatchObject({ status: "AVAILABLE", order: null });
  });
});

describe("motivo de la llamada + acknowledgeTable", () => {
  it("requestWaiter guarda el motivo; otra ronda no borra la llamada; Atendido → OCCUPIED", async () => {
    await requestWaiter({ token: f.t1.token, reason: "bill" });
    let row = await db.table.findUniqueOrThrow({ where: { id: f.t1.id } });
    expect(row).toMatchObject({ status: "NEEDS_ATTENTION", attentionReason: "BILL" });
    let t = mine(await getFloorForStaff({ id: f.ana, role: "WAITER" })).find((x) => x.id === f.t1.id)!;
    expect(t.attentionReason).toBe("bill");

    await addItemsToOrderByTableId({ tableId: f.t1.id, items: [{ productId: f.productId, quantity: 1 }] });
    row = await db.table.findUniqueOrThrow({ where: { id: f.t1.id } });
    expect(row.status).toBe("NEEDS_ATTENTION");

    await expect(acknowledgeTable({ tableId: f.t1.id }, { id: f.beto, role: "WAITER" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const r = await acknowledgeTable({ tableId: f.t1.id }, { id: f.ana, role: "WAITER" });
    expect(r).toMatchObject({ status: "OCCUPIED", changed: true, tableNumber: f.t1.number, waiterId: f.ana });
    row = await db.table.findUniqueOrThrow({ where: { id: f.t1.id } });
    expect(row).toMatchObject({ status: "OCCUPIED", attentionReason: null });
    t = mine(await getFloorForStaff({ id: f.ana, role: "WAITER" })).find((x) => x.id === f.t1.id)!;
    expect(t.attentionReason).toBeNull();

    // Idempotente
    expect(await acknowledgeTable({ tableId: f.t1.id }, { id: f.ana, role: "WAITER" })).toMatchObject({
      changed: false,
      status: "OCCUPIED",
    });
  });

  it("sin orden abierta Atendido → AVAILABLE; admin puede atender cualquier mesa", async () => {
    await requestWaiter({ token: f.t3.token, reason: "assistance" });
    expect((await db.table.findUniqueOrThrow({ where: { id: f.t3.id } })).attentionReason).toBe("ASSISTANCE");
    const r = await acknowledgeTable({ tableId: f.t3.id }, { id: f.admin, role: "ADMIN" });
    expect(r).toMatchObject({ status: "AVAILABLE", changed: true, orderId: null });
    expect(await db.table.findUniqueOrThrow({ where: { id: f.t3.id } })).toMatchObject({
      status: "AVAILABLE",
      attentionReason: null,
    });
  });

  it("la mesa asignada directo es del mesero directo, no del de la zona", async () => {
    await requestWaiter({ token: f.t2.token, reason: "assistance" });
    await expect(acknowledgeTable({ tableId: f.t2.id }, { id: f.ana, role: "WAITER" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(acknowledgeTable({ tableId: f.t2.id }, { id: f.ana, role: "CASHIER" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await acknowledgeTable({ tableId: f.t2.id }, { id: f.beto, role: "WAITER" })).changed).toBe(true);
  });

  it("closeOrder borra el motivo y deja la mesa AVAILABLE", async () => {
    await requestWaiter({ token: f.t1.token, reason: "bill" });
    const open = await db.order.findFirstOrThrow({ where: { tableId: f.t1.id, status: "OPEN" } });
    await closeOrder(open.id, f.ana);
    expect(await db.table.findUniqueOrThrow({ where: { id: f.t1.id } })).toMatchObject({
      status: "AVAILABLE",
      attentionReason: null,
    });
  });

  it("errores: id inválido y mesa inexistente", async () => {
    await expect(acknowledgeTable({ tableId: "nope" }, { id: f.ana, role: "WAITER" })).rejects.toThrow();
    await expect(
      acknowledgeTable({ tableId: "00000000-0000-4000-8000-000000000000" }, { id: f.admin, role: "ADMIN" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
