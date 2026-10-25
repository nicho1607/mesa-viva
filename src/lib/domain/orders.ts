// Mutaciones transaccionales de órdenes (docs/ARQUITECTURA.md, secciones 3 y 5.1).
//
// Reglas:
// - Precios SIEMPRE desde `Product` (el cliente solo manda productId/quantity/notes).
// - Toda mutación bloquea la fila de la orden (`SELECT … FOR UPDATE`), rechaza si no
//   está OPEN e incrementa `Order.version`.
// - Aquí NO se publican eventos de tiempo real: cada función devuelve lo necesario para
//   que el llamador publique tras el commit (`{ orderId, tableId, waiterId, version, … }`).

import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { Bill, ItemStatus } from "@/generated/prisma/client";
import { computeBill, parseBillingSettings } from "@/lib/domain/billing";
import {
  InvalidTableError,
  InvalidTransitionError,
  NotFoundError,
  OrderClosedError,
  UnavailableProductsError,
} from "@/lib/domain/errors";
import { canTransitionItem, groupBillLines } from "@/lib/domain/order-rules";

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Validación de entrada
// ---------------------------------------------------------------------------

export const orderItemsInput = z
  .array(
    z.object({
      productId: z.uuid(),
      quantity: z.number().int().min(1).max(20),
      notes: z.string().trim().max(200).optional(),
    }),
  )
  .min(1)
  .max(30);

export const addItemsInput = z.object({
  token: z.string().min(16).max(64),
  items: orderItemsInput,
});

export const addItemsByTableInput = z.object({
  tableId: z.uuid(),
  items: orderItemsInput,
});

export type OrderItemInput = z.input<typeof orderItemsInput>[number];

// ---------------------------------------------------------------------------
// Resultados (para que el llamador publique eventos tras el commit)
// ---------------------------------------------------------------------------

export type OrderMutationResult = {
  orderId: string;
  tableId: string;
  tableNumber: number;
  waiterId: string | null;
  version: number;
};

export type AddItemsResult = OrderMutationResult & { round: number; isNew: boolean };
export type ConfirmRoundResult = OrderMutationResult & { round: number; count: number };
export type ItemMutationResult = OrderMutationResult & { itemId: string; status: ItemStatus };
export type CloseOrderResult = OrderMutationResult & {
  bill: Bill;
  /** Ítems que quedaron PENDING / IN_PREPARATION al cerrar (el diálogo los advierte). */
  unservedCount: number;
};

// ---------------------------------------------------------------------------
// Añadir ítems (cliente vía QR o mesero en nombre del cliente)
// ---------------------------------------------------------------------------

/** Cliente: `{ token, items }` (token público del QR). */
export async function addItemsToOrder(raw: unknown): Promise<AddItemsResult> {
  const { token, items } = addItemsInput.parse(raw);
  return addItemsCore({ publicToken: token }, items);
}

/** Mesero en nombre del cliente: `{ tableId, items }`. La autorización la hace la Server Action. */
export async function addItemsToOrderByTableId(raw: unknown): Promise<AddItemsResult> {
  const { tableId, items } = addItemsByTableInput.parse(raw);
  return addItemsCore({ id: tableId }, items);
}

type ParsedItems = z.output<typeof orderItemsInput>;

async function addItemsCore(
  tableWhere: { publicToken: string } | { id: string },
  items: ParsedItems,
): Promise<AddItemsResult> {
  return withOpenOrderRetry(() =>
    db.$transaction(async (tx) => {
      const table = await tx.table.findUnique({ where: tableWhere, include: { zone: true } });
      if (!table || table.status === "INACTIVE") throw new InvalidTableError();

      // Precios SIEMPRE desde la BD
      const ids = [...new Set(items.map((i) => i.productId))];
      const products = await tx.product.findMany({ where: { id: { in: ids }, available: true } });
      const byId = new Map(products.map((p) => [p.id, p]));
      const missing = ids.filter((id) => !byId.has(id));
      if (missing.length) throw new UnavailableProductsError(missing);

      // Orden abierta existente o nueva. Si otra transacción la crea a la vez, el índice
      // único parcial `one_open_order_per_table` hace fallar este INSERT (P2002) y se reintenta.
      let order = await tx.order.findFirst({
        where: { tableId: table.id, status: "OPEN" },
        select: { id: true },
      });
      const isNew = !order;
      if (!order) {
        order = await tx.order.create({
          data: { tableId: table.id, waiterId: table.waiterId ?? table.zone.waiterId },
          select: { id: true },
        });
      }

      // Bloquea la fila: serializa contra closeOrder() y otros envíos
      const locked = await lockOrder(tx, order.id);
      if (locked.status !== "OPEN") throw new OrderClosedError();

      const round = locked.lastRound + 1;
      await tx.orderItem.createMany({
        data: items.map((i) => {
          const p = byId.get(i.productId)!;
          return {
            orderId: locked.id,
            productId: p.id,
            productName: p.name,
            unitPrice: p.price,
            quantity: i.quantity,
            notes: i.notes ? i.notes : null,
            round,
          };
        }),
      });

      const updated = await tx.order.update({
        where: { id: locked.id },
        data: { lastRound: round, version: { increment: 1 } },
        select: { version: true, waiterId: true },
      });
      // Una llamada pendiente (NEEDS_ATTENTION) no se pierde porque llegue otra ronda.
      await tx.table.updateMany({
        where: { id: table.id, status: { not: "NEEDS_ATTENTION" } },
        data: { status: "OCCUPIED" },
      });

      return {
        orderId: locked.id,
        tableId: table.id,
        tableNumber: table.number,
        waiterId: updated.waiterId,
        version: updated.version,
        round,
        isNew,
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Acciones del mesero sobre ítems
// ---------------------------------------------------------------------------

/** Confirma la ronda: sus ítems PENDING pasan a IN_PREPARATION. */
export async function confirmRound(orderId: string, round: number): Promise<ConfirmRoundResult> {
  return db.$transaction(async (tx) => {
    const locked = await lockOpenOrder(tx, orderId);
    const { count } = await tx.orderItem.updateMany({
      where: { orderId, round, status: "PENDING" },
      data: { status: "IN_PREPARATION" },
    });
    const bumped = await bumpVersion(tx, locked.id);
    return { ...bumped, round, count };
  });
}

/**
 * Cambia el estado de un ítem respetando las transiciones válidas
 * (PENDING → IN_PREPARATION → SERVED; PENDING/IN_PREPARATION → CANCELLED).
 * SERVED fija `servedAt`.
 */
export async function setItemStatus(itemId: string, status: ItemStatus): Promise<ItemMutationResult> {
  const ref = await db.orderItem.findUnique({ where: { id: itemId }, select: { orderId: true } });
  if (!ref) throw new NotFoundError("Ítem");

  return db.$transaction(async (tx) => {
    const locked = await lockOpenOrder(tx, ref.orderId);
    // Releer con la orden bloqueada: el estado pudo cambiar entre tanto
    const item = await tx.orderItem.findUnique({ where: { id: itemId }, select: { status: true } });
    if (!item) throw new NotFoundError("Ítem");
    if (!canTransitionItem(item.status, status)) throw new InvalidTransitionError(item.status, status);

    await tx.orderItem.update({
      where: { id: itemId },
      data: { status, ...(status === "SERVED" ? { servedAt: new Date() } : {}) },
    });
    const bumped = await bumpVersion(tx, locked.id);
    return { ...bumped, itemId, status };
  });
}

/** Cancela un ítem no servido. */
export function cancelItem(itemId: string): Promise<ItemMutationResult> {
  return setItemStatus(itemId, "CANCELLED");
}

// ---------------------------------------------------------------------------
// Cierre del servicio
// ---------------------------------------------------------------------------

/**
 * Cierra la orden: calcula la cuenta con `computeBill` (config de `Setting`, propina
 * sobrescribible), guarda `Bill` con snapshot de líneas, orden CLOSED y mesa AVAILABLE.
 */
export async function closeOrder(
  orderId: string,
  staffUserId: string,
  opts: { tipRate?: number } = {},
): Promise<CloseOrderResult> {
  if (opts.tipRate !== undefined && !(Number.isFinite(opts.tipRate) && opts.tipRate >= 0 && opts.tipRate <= 1)) {
    throw new RangeError("tipRate debe estar entre 0 y 1");
  }

  return db.$transaction(async (tx) => {
    await lockOpenOrder(tx, orderId);

    const [items, settingRows] = await Promise.all([
      tx.orderItem.findMany({ where: { orderId }, orderBy: [{ round: "asc" }, { createdAt: "asc" }] }),
      tx.setting.findMany(),
    ]);
    const settings = parseBillingSettings(settingRows);
    const tipRate = opts.tipRate ?? settings.tipRate;
    const totals = computeBill(items, {
      taxRate: settings.taxRate,
      tipRate,
      pricesIncludeTax: settings.pricesIncludeTax,
    });

    const bill = await tx.bill.create({
      data: {
        orderId,
        ...totals,
        taxRate: settings.taxRate,
        tipRate,
        lines: groupBillLines(items),
        closedById: staffUserId,
      },
    });

    const order = await tx.order.update({
      where: { id: orderId },
      data: { status: "CLOSED", closedAt: new Date(), version: { increment: 1 } },
      select: { id: true, tableId: true, waiterId: true, version: true },
    });
    const table = await tx.table.update({
      where: { id: order.tableId },
      data: { status: "AVAILABLE", attentionReason: null },
      select: { number: true },
    });

    return {
      orderId: order.id,
      tableId: order.tableId,
      tableNumber: table.number,
      waiterId: order.waiterId,
      version: order.version,
      bill,
      unservedCount: items.filter((i) => i.status === "PENDING" || i.status === "IN_PREPARATION").length,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type LockedOrder = {
  id: string;
  status: string;
  lastRound: number;
  tableId: string;
  waiterId: string | null;
};

async function lockOrder(tx: Tx, orderId: string): Promise<LockedOrder> {
  const [row] = await tx.$queryRaw<LockedOrder[]>`
    SELECT id, status::text AS status, "lastRound", "tableId", "waiterId"
    FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  if (!row) throw new NotFoundError("Orden");
  return row;
}

async function lockOpenOrder(tx: Tx, orderId: string): Promise<LockedOrder> {
  const row = await lockOrder(tx, orderId);
  if (row.status !== "OPEN") throw new OrderClosedError();
  return row;
}

async function bumpVersion(tx: Tx, orderId: string): Promise<OrderMutationResult> {
  const o = await tx.order.update({
    where: { id: orderId },
    data: { version: { increment: 1 } },
    select: { id: true, tableId: true, waiterId: true, version: true, table: { select: { number: true } } },
  });
  return { orderId: o.id, tableId: o.tableId, tableNumber: o.table.number, waiterId: o.waiterId, version: o.version };
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// Si dos dispositivos crean la orden a la vez, uno choca con el índice único parcial:
// se reintenta la transacción completa (en el reintento encuentra la orden ya creada).
async function withOpenOrderRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt < retries && isUniqueViolation(e)) continue;
      throw e;
    }
  }
}
