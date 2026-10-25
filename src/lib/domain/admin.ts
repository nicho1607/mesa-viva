// Administración (MV-012): menú, zonas, mesas, equipo y QR.
// Cada mutación recibe el `actor` (usuario de staff ya autenticado) y la entrada cruda;
// valida con Zod (mensajes en español por campo), exige ADMIN y no publica eventos:
// devuelve lo necesario para que la Server Action publique `table.updated` tras el commit.

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/domain/errors";

export type Actor = { id: string; role: string };

/** Solo ADMIN. Se llama al inicio de cada función de este módulo. */
export function assertAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN") throw new ForbiddenError("Solo un administrador puede hacer esto");
}

// ───────────────────────── Precios ─────────────────────────

/** Tope de precio: 10.000.000 pesos (cabe de sobra en un Int de centavos). */
export const MAX_PRICE_CENTS = 10_000_000 * 100;

/**
 * Convierte un precio escrito en pesos a centavos enteros, sin floats.
 * Acepta "28.000", "28000", "$ 28.000", "28.000,50" y "28000,5". Rechaza (null) negativos,
 * separadores mal puestos ("28.00", "28,000"), letras y vacíos.
 */
export function parsePriceToCents(raw: string): number | null {
  const s = raw.replace(/[\s $]/g, "").replace(/^COP/i, "");
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const pesos = m[1].replace(/\./g, "").replace(/^0+(?=\d)/, "");
  if (pesos.length > 9) return null;
  const frac = (m[2] ?? "").padEnd(2, "0");
  return Number(pesos) * 100 + Number(frac);
}

/** Centavos → texto editable en pesos: 1250000 → "12.500", 1250050 → "12.500,50". */
export function centsToPesosInput(cents: number): string {
  const pesos = Math.trunc(cents / 100);
  const rest = cents % 100;
  const int = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return rest ? `${int},${String(rest).padStart(2, "0")}` : int;
}

// ───────────────────────── Esquemas ─────────────────────────

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const text = (msg: string, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string({ error: msg }).min(1, { error: msg }).max(max, { error: `Máximo ${max} caracteres` }),
  );

const int = (msg: string, min: number, max: number, empty?: number) =>
  z.preprocess(
    (v) => {
      const b = blankToUndefined(v);
      if (b === undefined) return empty;
      return typeof b === "string" ? Number(b.trim()) : b;
    },
    z.number({ error: msg }).int({ error: msg }).min(min, { error: msg }).max(max, { error: msg }),
  );

const sortOrder = int("El orden debe ser un número entero entre 0 y 999", 0, 999, 0);

const id = (msg = "Elemento no válido") => z.uuid({ error: msg });

/** "" / ausente → null (p.ej. "Según la zona" o "Sin mesero"). */
const optionalId = (msg: string) => z.preprocess((v) => blankToUndefined(v) ?? null, z.uuid({ error: msg }).nullable());

/** Checkbox ("on") o valor explícito "true"/"false". */
const bool = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

const price = z
  .string({ error: "Escribe el precio" })
  .transform((s, ctx) => {
    const t = s.trim();
    if (t === "") {
      ctx.addIssue({ code: "custom", message: "Escribe el precio en pesos, por ejemplo 28.000" });
      return z.NEVER;
    }
    if (t.startsWith("-")) {
      ctx.addIssue({ code: "custom", message: "El precio no puede ser negativo" });
      return z.NEVER;
    }
    const cents = parsePriceToCents(t);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Escribe el precio en pesos, por ejemplo 28.000" });
      return z.NEVER;
    }
    if (cents <= 0) {
      ctx.addIssue({ code: "custom", message: "El precio debe ser mayor que cero" });
      return z.NEVER;
    }
    if (cents > MAX_PRICE_CENTS) {
      ctx.addIssue({ code: "custom", message: "El precio máximo es $ 10.000.000" });
      return z.NEVER;
    }
    return cents;
  });

export const categoryInput = z.object({
  name: text("Escribe el nombre de la categoría", 60),
  sortOrder,
});
export const categoryUpdateInput = categoryInput.extend({ id: id() });

export const productInput = z.object({
  name: text("Escribe el nombre del producto", 80),
  description: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || null : null),
    z.string().max(300, { error: "Máximo 300 caracteres" }).nullable(),
  ),
  price,
  categoryId: id("Elige una categoría"),
  available: bool,
  sortOrder,
});
export const productUpdateInput = productInput.extend({ id: id() });

export const zoneInput = z.object({
  name: text("Escribe el nombre de la zona", 60),
  waiterId: optionalId("Elige un mesero de la lista"),
});
export const zoneUpdateInput = zoneInput.extend({ id: id() });

export const tableInput = z.object({
  number: int("Escribe un número de mesa (entero, mayor que cero)", 1, 999_999),
  seats: int("Los puestos deben estar entre 1 y 30", 1, 30, 4),
  zoneId: id("Elige una zona"),
  waiterId: optionalId("Elige un mesero de la lista"),
});
export const tableUpdateInput = tableInput.extend({ id: id() });

const ROLES = ["WAITER", "ADMIN", "CASHIER"] as const;
const password = z
  .string({ error: "Escribe una contraseña de al menos 8 caracteres" })
  .min(8, { error: "La contraseña debe tener al menos 8 caracteres" })
  .max(200, { error: "Máximo 200 caracteres" });

export const userInput = z.object({
  name: text("Escribe el nombre", 80),
  email: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z.email({ error: "Escribe un email válido" }).max(254, { error: "Escribe un email válido" }),
  ),
  role: z.enum(ROLES, { error: "Elige un rol" }),
  password,
});

const idOnly = z.object({ id: id() });
const toggle = z.object({ id: id(), active: bool });
const availability = z.object({ id: id(), available: bool });
const passwordReset = z.object({ id: id(), password });

// ───────────────────────── Utilidades ─────────────────────────

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Ejecuta `fn`; si choca con un índice único lanza ConflictError en `field`. */
async function unique<T>(fn: () => Promise<T>, message: string, field: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError(message, field);
    throw e;
  }
}

async function assertWaiter(waiterId: string | null): Promise<void> {
  if (!waiterId) return;
  const u = await db.user.findUnique({ where: { id: waiterId }, select: { role: true, active: true } });
  if (!u || u.role !== "WAITER" || !u.active) {
    throw new ConflictError("Elige un mesero activo de la lista", "waiterId");
  }
}

export const newPublicToken = () => randomBytes(18).toString("base64url");

/** URL que codifica el QR de una mesa. `origin` sin barra final. */
export function tablePublicUrl(origin: string, publicToken: string): string {
  return `${origin.replace(/\/+$/, "")}/m/${publicToken}`;
}

/** Lo que la Server Action necesita para avisar al salón (y a los meseros afectados). */
export type FloorChange = {
  tableId?: string;
  tableNumber?: number;
  /** Meseros cuyo plano cambia (antes y después de la mutación), sin duplicados ni null. */
  waiterIds: string[];
};

const uniqIds = (...ids: (string | null | undefined)[]) => [...new Set(ids.filter((x): x is string => !!x))];

// ───────────────────────── Menú ─────────────────────────

export async function createCategory(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const data = categoryInput.parse(raw);
  return unique(() => db.category.create({ data }), "Ya existe una categoría con ese nombre", "name");
}

export async function updateCategory(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const { id, ...data } = categoryUpdateInput.parse(raw);
  await mustExist(db.category.findUnique({ where: { id }, select: { id: true } }), "Categoría");
  return unique(
    () => db.category.update({ where: { id }, data }),
    "Ya existe una categoría con ese nombre",
    "name",
  );
}

/** No borra categorías con productos: hay que moverlos o eliminarlos antes. */
export async function deleteCategory(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const { id } = idOnly.parse(raw);
  const cat = await mustExist(
    db.category.findUnique({ where: { id }, select: { name: true, _count: { select: { products: true } } } }),
    "Categoría",
  );
  const n = cat._count.products;
  if (n > 0) {
    throw new ConflictError(
      `"${cat.name}" tiene ${n} ${n === 1 ? "producto" : "productos"}. Muévelos a otra categoría o elimínalos primero.`,
    );
  }
  await db.category.delete({ where: { id } });
  return { id };
}

async function assertCategory(categoryId: string) {
  const c = await db.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!c) throw new ConflictError("Elige una categoría", "categoryId");
}

export async function createProduct(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const data = productInput.parse(raw);
  await assertCategory(data.categoryId);
  return db.product.create({ data });
}

export async function updateProduct(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const { id, ...data } = productUpdateInput.parse(raw);
  await mustExist(db.product.findUnique({ where: { id }, select: { id: true } }), "Producto");
  await assertCategory(data.categoryId);
  return db.product.update({ where: { id }, data });
}

/** "Disponible / Agotado" (y "Retirar del menú" = available false). */
export async function setProductAvailable(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const { id, available } = availability.parse(raw);
  await mustExist(db.product.findUnique({ where: { id }, select: { id: true } }), "Producto");
  return db.product.update({ where: { id }, data: { available }, select: { id: true, available: true } });
}

/** Borrado definitivo solo si nunca se pidió; si no, hay que retirarlo del menú. */
export async function deleteProduct(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const { id } = idOnly.parse(raw);
  const p = await mustExist(
    db.product.findUnique({ where: { id }, select: { _count: { select: { orderItems: true } } } }),
    "Producto",
  );
  if (p._count.orderItems > 0) {
    throw new ConflictError("Este producto ya aparece en pedidos: retíralo del menú en lugar de eliminarlo.");
  }
  await db.product.delete({ where: { id } });
  return { id };
}

// ───────────────────────── Zonas y mesas ─────────────────────────

export async function createZone(actor: Actor, raw: unknown): Promise<FloorChange> {
  assertAdmin(actor);
  const data = zoneInput.parse(raw);
  await assertWaiter(data.waiterId);
  await unique(() => db.zone.create({ data }), "Ya existe una zona con ese nombre", "name");
  return { waiterIds: uniqIds(data.waiterId) };
}

export async function updateZone(actor: Actor, raw: unknown): Promise<FloorChange> {
  assertAdmin(actor);
  const { id, ...data } = zoneUpdateInput.parse(raw);
  const before = await mustExist(db.zone.findUnique({ where: { id }, select: { waiterId: true } }), "Zona");
  await assertWaiter(data.waiterId);
  await unique(() => db.zone.update({ where: { id }, data }), "Ya existe una zona con ese nombre", "name");
  return { waiterIds: uniqIds(before.waiterId, data.waiterId) };
}

export async function deleteZone(actor: Actor, raw: unknown): Promise<FloorChange> {
  assertAdmin(actor);
  const { id } = idOnly.parse(raw);
  const z0 = await mustExist(
    db.zone.findUnique({ where: { id }, select: { name: true, waiterId: true, _count: { select: { tables: true } } } }),
    "Zona",
  );
  const n = z0._count.tables;
  if (n > 0) {
    throw new ConflictError(
      `"${z0.name}" tiene ${n} ${n === 1 ? "mesa" : "mesas"}. Muévelas a otra zona o elimínalas primero.`,
    );
  }
  await db.zone.delete({ where: { id } });
  return { waiterIds: uniqIds(z0.waiterId) };
}

async function assertZone(zoneId: string) {
  const z0 = await db.zone.findUnique({ where: { id: zoneId }, select: { waiterId: true } });
  if (!z0) throw new ConflictError("Elige una zona", "zoneId");
  return z0;
}

const TABLE_NUMBER_TAKEN = "Ya existe una mesa con ese número";

export async function createTable(actor: Actor, raw: unknown): Promise<FloorChange> {
  assertAdmin(actor);
  const data = tableInput.parse(raw);
  const zone = await assertZone(data.zoneId);
  await assertWaiter(data.waiterId);
  const t = await unique(
    () => db.table.create({ data: { ...data, publicToken: newPublicToken() } }),
    TABLE_NUMBER_TAKEN,
    "number",
  );
  return { tableId: t.id, tableNumber: t.number, waiterIds: uniqIds(data.waiterId ?? zone.waiterId) };
}

const tableBefore = (id: string) =>
  mustExist(
    db.table.findUnique({
      where: { id },
      select: {
        number: true,
        status: true,
        waiterId: true,
        zone: { select: { waiterId: true } },
        orders: { where: { status: "OPEN" }, select: { id: true, waiterId: true }, take: 1 },
        _count: { select: { orders: true } },
      },
    }),
    "Mesa",
  );

export async function updateTable(actor: Actor, raw: unknown): Promise<FloorChange> {
  assertAdmin(actor);
  const { id, ...data } = tableUpdateInput.parse(raw);
  const before = await tableBefore(id);
  const zone = await assertZone(data.zoneId);
  await assertWaiter(data.waiterId);
  const t = await unique(() => db.table.update({ where: { id }, data }), TABLE_NUMBER_TAKEN, "number");
  return {
    tableId: t.id,
    tableNumber: t.number,
    waiterIds: uniqIds(
      before.waiterId ?? before.zone.waiterId,
      before.orders[0]?.waiterId,
      data.waiterId ?? zone.waiterId,
    ),
  };
}

const OPEN_ORDER_MESSAGE = (n: number, what: string) =>
  `La mesa ${n} tiene una cuenta abierta. Ciérrala antes de ${what}.`;

/** "Activa / Inactiva". No desactiva una mesa con orden OPEN. Activar la deja AVAILABLE. */
export async function setTableActive(actor: Actor, raw: unknown): Promise<FloorChange> {
  assertAdmin(actor);
  const { id, active } = toggle.parse(raw);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Table" WHERE id = ${id} FOR UPDATE`;
    const t = await mustExist(
      tx.table.findUnique({
        where: { id },
        select: {
          number: true,
          status: true,
          waiterId: true,
          zone: { select: { waiterId: true } },
          orders: { where: { status: "OPEN" }, select: { id: true }, take: 1 },
        },
      }),
      "Mesa",
    );
    const change = { tableId: id, tableNumber: t.number, waiterIds: uniqIds(t.waiterId ?? t.zone.waiterId) };
    if (!active) {
      if (t.orders.length > 0) throw new ConflictError(OPEN_ORDER_MESSAGE(t.number, "desactivarla"));
      if (t.status !== "INACTIVE") {
        await tx.table.update({ where: { id }, data: { status: "INACTIVE", attentionReason: null } });
      }
    } else if (t.status === "INACTIVE") {
      await tx.table.update({ where: { id }, data: { status: "AVAILABLE", attentionReason: null } });
    }
    return change;
  });
}

/** Solo mesas sin historial de pedidos; las demás se desactivan. */
export async function deleteTable(actor: Actor, raw: unknown): Promise<FloorChange> {
  assertAdmin(actor);
  const { id } = idOnly.parse(raw);
  const t = await tableBefore(id);
  if (t.orders.length > 0) throw new ConflictError(OPEN_ORDER_MESSAGE(t.number, "eliminarla"));
  if (t._count.orders > 0) {
    throw new ConflictError(`La mesa ${t.number} tiene cuentas anteriores: desactívala en lugar de eliminarla.`);
  }
  await db.table.delete({ where: { id } });
  return { tableId: id, tableNumber: t.number, waiterIds: uniqIds(t.waiterId ?? t.zone.waiterId) };
}

/** Nuevo publicToken: el QR impreso anterior deja de funcionar al instante. */
export async function rotateTableToken(actor: Actor, raw: unknown): Promise<FloorChange & { publicToken: string }> {
  assertAdmin(actor);
  const { id } = idOnly.parse(raw);
  const before = await tableBefore(id);
  const t = await db.table.update({
    where: { id },
    data: { publicToken: newPublicToken() },
    select: { id: true, number: true, publicToken: true },
  });
  return {
    tableId: t.id,
    tableNumber: t.number,
    publicToken: t.publicToken,
    waiterIds: uniqIds(before.waiterId ?? before.zone.waiterId),
  };
}

// ───────────────────────── Equipo ─────────────────────────

export const BCRYPT_ROUNDS = 10;

export async function createUser(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const { password: pw, ...data } = userInput.parse(raw);
  const passwordHash = await bcrypt.hash(pw, BCRYPT_ROUNDS);
  return unique(
    () =>
      db.user.create({
        data: { ...data, passwordHash },
        select: { id: true, name: true, email: true, role: true, active: true },
      }),
    "Ya existe una persona con ese email",
    "email",
  );
}

/** Activa/desactiva una cuenta. Un admin no puede desactivarse a sí mismo. */
export async function setUserActive(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const { id, active } = toggle.parse(raw);
  if (!active && id === actor.id) throw new ConflictError("No puedes desactivar tu propia cuenta.");
  await mustExist(db.user.findUnique({ where: { id }, select: { id: true } }), "Usuario");
  return db.user.update({ where: { id }, data: { active }, select: { id: true, active: true } });
}

export async function resetUserPassword(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const { id, password: pw } = passwordReset.parse(raw);
  await mustExist(db.user.findUnique({ where: { id }, select: { id: true } }), "Usuario");
  await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(pw, BCRYPT_ROUNDS) } });
  return { id };
}

// ───────────────────────── Lecturas para las páginas ─────────────────────────

export async function getAdminMenu(actor: Actor) {
  assertAdmin(actor);
  return db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      sortOrder: true,
      products: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          available: true,
          sortOrder: true,
          categoryId: true,
          _count: { select: { orderItems: true } },
        },
      },
    },
  });
}
export type AdminMenu = Awaited<ReturnType<typeof getAdminMenu>>;

export async function getAdminFloor(actor: Actor) {
  assertAdmin(actor);
  const [zones, waiters] = await Promise.all([
    db.zone.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        waiterId: true,
        waiter: { select: { name: true, active: true } },
        tables: {
          orderBy: { number: "asc" },
          select: {
            id: true,
            number: true,
            seats: true,
            status: true,
            zoneId: true,
            waiterId: true,
            waiter: { select: { name: true } },
            orders: { where: { status: "OPEN" }, select: { id: true }, take: 1 },
            _count: { select: { orders: true } },
          },
        },
      },
    }),
    db.user.findMany({
      where: { role: "WAITER", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return { zones, waiters };
}
export type AdminFloor = Awaited<ReturnType<typeof getAdminFloor>>;

export async function getAdminUsers(actor: Actor) {
  assertAdmin(actor);
  return db.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, active: true },
  });
}

/** Mesas activas para la hoja imprimible de QR. */
export async function getQrTables(actor: Actor) {
  assertAdmin(actor);
  return db.table.findMany({
    where: { status: { not: "INACTIVE" } },
    orderBy: { number: "asc" },
    select: { id: true, number: true, zone: { select: { name: true } } },
  });
}

async function mustExist<T>(p: Promise<T | null>, entity: string): Promise<T> {
  const v = await p;
  if (!v) throw new NotFoundError(entity);
  return v;
}
