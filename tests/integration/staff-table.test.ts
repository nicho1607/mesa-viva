// Detalle de mesa del personal: permisos (assertCanActOnTable), serveRound,
// getTableDetailForStaff y el cierre con propina a través del dominio autorizado.
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError, OrderClosedError } from "@/lib/domain/errors";
import { addItemsToOrderByTableId, confirmRound, serveRound, setItemStatus } from "@/lib/domain/orders";
import {
  assertCanActOnTable,
  getTableDetailForStaff,
  staffAddItems,
  staffCancelItem,
  staffCloseService,
  staffConfirmRound,
  staffServeRound,
  staffSetItemStatus,
} from "@/lib/domain/staff-table";

const tag = randomBytes(4).toString("hex");
const base = 600_000 + (parseInt(tag, 16) % 90_000) * 10;
const u = { ana: { id: "", role: "WAITER" }, beto: { id: "", role: "WAITER" }, admin: { id: "", role: "ADMIN" }, caja: { id: "", role: "CASHIER" } };
const f = { zoneA: "", categoryId: "", soup: "", juice: "", t1: "", t2: "", t3: "" };

beforeAll(async () => {
  for (const [k, role] of [["ana", "WAITER"], ["beto", "WAITER"], ["admin", "ADMIN"], ["caja", "CASHIER"]] as const) {
    u[k].id = (await db.user.create({ data: { name: `${k}-${tag}`, email: `${k}-st-${tag}@test.local`, passwordHash: "x", role } })).id;
  }
  f.zoneA = (await db.zone.create({ data: { name: `A st ${tag}`, waiterId: u.ana.id } })).id;
  f.categoryId = (await db.category.create({ data: { name: `st ${tag}` } })).id;
  f.soup = (await db.product.create({ data: { name: "Ajiaco", price: 30_000_00, categoryId: f.categoryId } })).id;
  f.juice = (await db.product.create({ data: { name: "Jugo de mora", price: 7_000_00, categoryId: f.categoryId } })).id;
  const mk = async (n: number, waiterId: string | null) =>
    (await db.table.create({ data: { number: base + n, publicToken: `s${tag}${randomBytes(10).toString("hex")}`, zoneId: f.zoneA, waiterId } })).id;
  f.t1 = await mk(1, null); // zona de Ana
  f.t2 = await mk(2, u.beto.id); // asignada directo a Beto
  f.t3 = await mk(3, null); // zona de Ana, para el flujo de cierre
});

afterAll(async () => {
  const tableIds = [f.t1, f.t2, f.t3];
  const orderIds = (await db.order.findMany({ where: { tableId: { in: tableIds } }, select: { id: true } })).map((o) => o.id);
  await db.bill.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.table.deleteMany({ where: { id: { in: tableIds } } });
  await db.zone.deleteMany({ where: { id: f.zoneA } });
  await db.product.deleteMany({ where: { categoryId: f.categoryId } });
  await db.category.deleteMany({ where: { id: f.categoryId } });
  await db.user.deleteMany({ where: { id: { in: Object.values(u).map((x) => x.id) } } });
});

describe("assertCanActOnTable", () => {
  it("mesero de la zona sí; otro mesero no; mesa con mesero directo solo para él", async () => {
    for (const a of ["view", "manage", "close"] as const) await expect(assertCanActOnTable(u.ana, f.t1, a)).resolves.toMatchObject({ tableId: f.t1 });
    await expect(assertCanActOnTable(u.beto, f.t1, "view")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assertCanActOnTable(u.beto, f.t2, "manage")).resolves.toBeTruthy();
    await expect(assertCanActOnTable(u.ana, f.t2, "view")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admin todo; caja ve y cierra pero no gestiona", async () => {
    for (const a of ["view", "manage", "close"] as const) await expect(assertCanActOnTable(u.admin, f.t2, a)).resolves.toBeTruthy();
    await expect(assertCanActOnTable(u.caja, f.t1, "view")).resolves.toBeTruthy();
    await expect(assertCanActOnTable(u.caja, f.t1, "close")).resolves.toBeTruthy();
    await expect(assertCanActOnTable(u.caja, f.t1, "manage")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("el mesero de la orden abierta conserva acceso aunque la mesa se reasigne", async () => {
    await addItemsToOrderByTableId({ tableId: f.t1, items: [{ productId: f.juice, quantity: 1 }] }); // orden con mesero Ana
    await db.table.update({ where: { id: f.t1 }, data: { waiterId: u.beto.id } });
    try {
      await expect(assertCanActOnTable(u.ana, f.t1, "manage")).resolves.toBeTruthy();
      await expect(assertCanActOnTable(u.beto, f.t1, "manage")).resolves.toBeTruthy();
    } finally {
      await db.table.update({ where: { id: f.t1 }, data: { waiterId: null } });
    }
  });

  it("mesa inexistente o id inválido → NotFoundError", async () => {
    await expect(assertCanActOnTable(u.admin, randomUUID(), "view")).rejects.toBeInstanceOf(NotFoundError);
    await expect(assertCanActOnTable(u.admin, "no-es-uuid", "view")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("serveRound", () => {
  it("pasa a SERVED solo los IN_PREPARATION de la ronda (con servedAt)", async () => {
    const r1 = await addItemsToOrderByTableId({
      tableId: f.t2,
      items: [
        { productId: f.soup, quantity: 1 },
        { productId: f.juice, quantity: 2 },
        { productId: f.juice, quantity: 1, notes: "Sin azúcar" },
      ],
    });
    await addItemsToOrderByTableId({ tableId: f.t2, items: [{ productId: f.soup, quantity: 1 }] }); // ronda 2 PENDING
    await confirmRound(r1.orderId, 1);
    const items = await db.orderItem.findMany({ where: { orderId: r1.orderId, round: 1 }, orderBy: { createdAt: "asc" } });
    await setItemStatus(items[0].id, "SERVED");
    await setItemStatus(items[1].id, "CANCELLED");

    const res = await serveRound(r1.orderId, 1);
    expect(res.count).toBe(1);
    expect(res.tableId).toBe(f.t2);
    const after = await db.orderItem.findMany({ where: { orderId: r1.orderId } });
    const byRound = (n: number) => after.filter((i) => i.round === n);
    expect(byRound(1).map((i) => i.status).sort()).toEqual(["CANCELLED", "SERVED", "SERVED"]);
    expect(byRound(1).filter((i) => i.status === "SERVED").every((i) => i.servedAt)).toBe(true);
    expect(byRound(2).map((i) => i.status)).toEqual(["PENDING"]);
    expect((await serveRound(r1.orderId, 1)).count).toBe(0);
  });

  it("vía dominio autorizado: otro mesero no puede; con orden cerrada → OrderClosedError", async () => {
    const order = await db.order.findFirstOrThrow({ where: { tableId: f.t2, status: "OPEN" } });
    await expect(staffServeRound(u.ana, { orderId: order.id, round: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(staffConfirmRound(u.ana, { orderId: order.id, round: 2 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(staffConfirmRound(u.beto, { orderId: order.id, round: 2 })).resolves.toMatchObject({ count: 1 });
    await staffCloseService(u.beto, { orderId: order.id, tipRate: 0 });
    await expect(serveRound(order.id, 2)).rejects.toBeInstanceOf(OrderClosedError);
  });
});

describe("getTableDetailForStaff + cierre con propina", () => {
  it("lista rondas, ítems y totales en vivo; permisos según rol", async () => {
    await staffAddItems(u.ana, { tableId: f.t3, items: [{ productId: f.soup, quantity: 2, notes: "Sin cebolla" }] });
    await staffAddItems(u.ana, { tableId: f.t3, items: [{ productId: f.juice, quantity: 1 }] });
    await expect(staffAddItems(u.caja, { tableId: f.t3, items: [{ productId: f.juice, quantity: 1 }] })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    const d = await getTableDetailForStaff(u.ana, f.t3);
    expect(d.table).toMatchObject({ id: f.t3, number: base + 3, zoneName: `A st ${tag}`, status: "OCCUPIED", attentionReason: null });
    expect(d.order?.rounds.map((r) => r.round)).toEqual([1, 2]);
    const soup = d.order!.rounds[0].items[0];
    expect(soup).toMatchObject({ productName: "Ajiaco", unitPrice: 30_000_00, quantity: 2, notes: "Sin cebolla", status: "PENDING", servedAt: null });
    expect(typeof soup.createdAt).toBe("string");
    expect(d.totals?.subtotal).toBe(67_000_00);
    expect(d.closedBill).toBeNull();
    expect(d.can).toEqual({ manage: true, close: true });

    const asCashier = await getTableDetailForStaff(u.caja, f.t3);
    expect(asCashier.can).toEqual({ manage: false, close: true });
    await expect(getTableDetailForStaff(u.beto, f.t3)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("caja no cambia ítems; el mesero sí (y cancelar resta del subtotal)", async () => {
    const d = await getTableDetailForStaff(u.ana, f.t3);
    const juice = d.order!.rounds[1].items[0];
    await expect(staffSetItemStatus(u.caja, { itemId: juice.id, status: "IN_PREPARATION" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(staffCancelItem(u.beto, { itemId: juice.id })).rejects.toBeInstanceOf(ForbiddenError);
    await staffCancelItem(u.ana, { itemId: juice.id });
    await staffConfirmRound(u.ana, { orderId: d.order!.id, round: 1 });
    const after = await getTableDetailForStaff(u.ana, f.t3);
    expect(after.totals?.subtotal).toBe(60_000_00);
    expect(after.order!.rounds[0].items[0].status).toBe("IN_PREPARATION");
  });

  it("caja cierra con propina 15 %: Bill, mesa libre y la cuenta cerrada aparece en el detalle", async () => {
    const { order } = await getTableDetailForStaff(u.caja, f.t3);
    await expect(staffCloseService(u.caja, { orderId: order!.id, tipRate: 1.5 })).rejects.toBeInstanceOf(ZodError);
    await expect(staffCloseService(u.beto, { orderId: order!.id, tipRate: 0.1 })).rejects.toBeInstanceOf(ForbiddenError);

    const r = await staffCloseService(u.caja, { orderId: order!.id, tipRate: 0.15 });
    expect(r.unservedCount).toBe(1); // el ajiaco sigue en cocina
    expect(Number(r.bill.tipRate)).toBe(0.15);
    expect(r.bill.subtotal).toBe(60_000_00);
    expect(r.bill.tipAmount).toBe(9_000_00);
    expect(r.bill.closedById).toBe(u.caja.id);

    const d = await getTableDetailForStaff(u.ana, f.t3);
    expect(d.table.status).toBe("AVAILABLE");
    expect(d.order).toBeNull();
    expect(d.closedBill).toMatchObject({ orderId: order!.id, tipRate: 0.15, tipAmount: 9_000_00, closedByName: `caja-${tag}` });
    expect(d.closedBill!.lines).toEqual([expect.objectContaining({ productName: "Ajiaco", quantity: 2, notes: "Sin cebolla" })]);

    // Más de 2 h después ya no se muestra
    const later = await getTableDetailForStaff(u.ana, f.t3, new Date(Date.now() + 3 * 60 * 60 * 1000));
    expect(later.closedBill).toBeNull();
    await expect(staffCloseService(u.caja, { orderId: order!.id, tipRate: 0.1 })).rejects.toBeInstanceOf(OrderClosedError);
  });
});
