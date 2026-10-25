// Administración (MV-012): guardas de borrado/desactivación, rotación de token, cuentas y rol.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import * as admin from "@/lib/domain/admin";
import { ConflictError, ForbiddenError } from "@/lib/domain/errors";
import { addItemsToOrderByTableId } from "@/lib/domain/orders";

const tag = randomBytes(4).toString("hex");
const base = 900_000 + (parseInt(tag, 16) % 9_000) * 10;
const f = {
  admin: { id: "", role: "ADMIN" },
  waiter: { id: "", role: "WAITER" },
  zone: "",
  cat: "",
  tableA: "",
  tableB: "",
};
const emails: string[] = [];

const caught = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as Error & { field?: string });

beforeAll(async () => {
  const mk = async (name: string, role: "ADMIN" | "WAITER") => {
    const email = `${name}-${tag}@test.local`;
    emails.push(email);
    return (await db.user.create({ data: { name, email, role, passwordHash: "x" } })).id;
  };
  f.admin.id = await mk("adm", "ADMIN");
  f.waiter.id = await mk("mes", "WAITER");
  f.zone = (await db.zone.create({ data: { name: `Z admin ${tag}`, waiterId: f.waiter.id } })).id;
  f.cat = (await admin.createCategory(f.admin, { name: `Cat admin ${tag}`, sortOrder: "1" })).id;
});

afterAll(async () => {
  const tables = await db.table.findMany({ where: { zoneId: f.zone }, select: { id: true } });
  const orders = await db.order.findMany({
    where: { tableId: { in: tables.map((t) => t.id) } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.table.deleteMany({ where: { zoneId: f.zone } });
  await db.zone.deleteMany({ where: { id: f.zone } });
  await db.product.deleteMany({ where: { categoryId: f.cat } });
  await db.category.deleteMany({ where: { name: { contains: tag } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
});

const product = (name: string, price = "12.500") =>
  admin.createProduct(f.admin, { name, price, categoryId: f.cat, available: "on", sortOrder: "" });

describe("menú", () => {
  it("guarda el precio en centavos y rechaza negativos", async () => {
    const p = await product(`Arepa ${tag}`, "12.500");
    expect(p.price).toBe(1_250_000);
    expect(await caught(product(`Mala ${tag}`, "-1.000"))).toBeInstanceOf(ZodError);
  });

  it("nombre de categoría único → ConflictError en el campo name", async () => {
    const e = await caught(admin.createCategory(f.admin, { name: `Cat admin ${tag}` }));
    expect(e).toBeInstanceOf(ConflictError);
    expect(e?.field).toBe("name");
  });

  it("no borra una categoría con productos; sí una vacía", async () => {
    await expect(admin.deleteCategory(f.admin, { id: f.cat })).rejects.toThrow(/tiene \d+ producto/);
    const empty = await admin.createCategory(f.admin, { name: `Vacía ${tag}` });
    await admin.deleteCategory(f.admin, { id: empty.id });
    expect(await db.category.findUnique({ where: { id: empty.id } })).toBeNull();
  });

  it("producto pedido: no se borra, se retira (available false); nunca pedido: se borra", async () => {
    const used = await product(`Usado ${tag}`);
    const fresh = await product(`Nuevo ${tag}`);
    const t = await admin.createTable(f.admin, { number: String(base + 9), zoneId: f.zone });
    await addItemsToOrderByTableId({ tableId: t.tableId, items: [{ productId: used.id, quantity: 1 }] });

    await expect(admin.deleteProduct(f.admin, { id: used.id })).rejects.toThrow(/retíralo del menú/);
    const r = await admin.setProductAvailable(f.admin, { id: used.id, available: "false" });
    expect(r.available).toBe(false);

    await admin.deleteProduct(f.admin, { id: fresh.id });
    expect(await db.product.findUnique({ where: { id: fresh.id } })).toBeNull();
  });
});

describe("mesas", () => {
  beforeAll(async () => {
    f.tableA = (await admin.createTable(f.admin, { number: String(base + 1), seats: "2", zoneId: f.zone })).tableId!;
    f.tableB = (await admin.createTable(f.admin, { number: String(base + 2), zoneId: f.zone })).tableId!;
  });

  it("número de mesa único", async () => {
    const e = await caught(admin.createTable(f.admin, { number: String(base + 1), zoneId: f.zone }));
    expect(e).toBeInstanceOf(ConflictError);
    expect(e?.field).toBe("number");
  });

  it("solo asigna meseros activos con rol WAITER", async () => {
    const e = await caught(
      admin.updateTable(f.admin, { id: f.tableA, number: String(base + 1), zoneId: f.zone, waiterId: f.admin.id }),
    );
    expect(e).toBeInstanceOf(ConflictError);
    const ok = await admin.updateTable(f.admin, {
      id: f.tableA,
      number: String(base + 1),
      seats: "2",
      zoneId: f.zone,
      waiterId: f.waiter.id,
    });
    expect(ok.waiterIds).toEqual([f.waiter.id]);
  });

  it("no desactiva ni borra una mesa con orden OPEN", async () => {
    const p = await product(`Mesa ${tag}`);
    await addItemsToOrderByTableId({ tableId: f.tableB, items: [{ productId: p.id, quantity: 1 }] });
    await expect(admin.setTableActive(f.admin, { id: f.tableB, active: "false" })).rejects.toThrow(/cuenta abierta/);
    await expect(admin.deleteTable(f.admin, { id: f.tableB })).rejects.toThrow(/cuenta abierta/);
    expect((await db.table.findUniqueOrThrow({ where: { id: f.tableB } })).status).not.toBe("INACTIVE");

    await admin.setTableActive(f.admin, { id: f.tableA, active: "false" });
    expect((await db.table.findUniqueOrThrow({ where: { id: f.tableA } })).status).toBe("INACTIVE");
    await admin.setTableActive(f.admin, { id: f.tableA, active: "true" });
    expect((await db.table.findUniqueOrThrow({ where: { id: f.tableA } })).status).toBe("AVAILABLE");
  });

  it("rotar el código cambia el publicToken", async () => {
    const before = (await db.table.findUniqueOrThrow({ where: { id: f.tableA } })).publicToken;
    const r = await admin.rotateTableToken(f.admin, { id: f.tableA });
    expect(r.publicToken).not.toBe(before);
    expect(r.publicToken).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(await db.table.findUnique({ where: { publicToken: before } })).toBeNull();
  });

  it("no borra una zona con mesas", async () => {
    await expect(admin.deleteZone(f.admin, { id: f.zone })).rejects.toThrow(/tiene \d+ mesa/);
  });
});

describe("equipo", () => {
  it("crea la cuenta con bcrypt y rechaza emails repetidos", async () => {
    const email = `nuevo-${tag}@test.local`;
    emails.push(email);
    const u = await admin.createUser(f.admin, {
      name: "Nuevo",
      email: email.toUpperCase(),
      role: "CASHIER",
      password: "clave-segura",
    });
    expect(u.email).toBe(email);
    const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.passwordHash).not.toContain("clave-segura");
    expect(await bcrypt.compare("clave-segura", row.passwordHash)).toBe(true);

    const dup = await caught(admin.createUser(f.admin, { name: "Otro", email, role: "WAITER", password: "otra-clave" }));
    expect(dup).toBeInstanceOf(ConflictError);
    expect(dup?.field).toBe("email");

    const short = await caught(
      admin.createUser(f.admin, { name: "Corta", email: `c-${tag}@test.local`, role: "WAITER", password: "1234567" }),
    );
    expect(short).toBeInstanceOf(ZodError);

    await admin.resetUserPassword(f.admin, { id: u.id, password: "nueva-clave" });
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await bcrypt.compare("nueva-clave", after.passwordHash)).toBe(true);
  });

  it("un admin no puede desactivarse a sí mismo; sí a otros", async () => {
    await expect(admin.setUserActive(f.admin, { id: f.admin.id, active: "false" })).rejects.toThrow(/propia cuenta/);
    const r = await admin.setUserActive(f.admin, { id: f.waiter.id, active: "false" });
    expect(r.active).toBe(false);
    await admin.setUserActive(f.admin, { id: f.waiter.id, active: "true" });
  });
});

describe("rol", () => {
  it("un mesero no puede usar ninguna función de administración", async () => {
    const calls = [
      () => admin.createCategory(f.waiter, { name: `X ${tag}` }),
      () => admin.createProduct(f.waiter, {}),
      () => admin.rotateTableToken(f.waiter, { id: f.tableA }),
      () => admin.setTableActive(f.waiter, { id: f.tableA, active: "false" }),
      () => admin.createUser(f.waiter, {}),
      () => admin.setUserActive(f.waiter, { id: f.admin.id, active: "false" }),
      () => admin.getAdminMenu(f.waiter),
    ];
    for (const call of calls) expect(await caught(call())).toBeInstanceOf(ForbiddenError);
  });
});
