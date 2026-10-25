// Detalle de mesa para el personal (/staff/mesas/[id]): lectura + mutaciones autorizadas.
// Sin Next: testeable con Vitest. Las Server Actions (`table.actions.ts`) solo hacen
// requireStaff → estas funciones → publicar eventos.

import { z } from "zod";
import { db } from "@/lib/db";
import type { ItemStatus, OrderStatus, TableStatus } from "@/generated/prisma/client";
import { computeBill, parseBillingSettings, type BillTotals } from "@/lib/domain/billing";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import {
  addItemsToOrderByTableId,
  cancelItem,
  closeOrder,
  confirmRound,
  orderItemsInput,
  serveRound,
  setItemStatus,
  type AddItemsResult,
  type CloseOrderResult,
  type ConfirmRoundResult,
  type ItemMutationResult,
} from "@/lib/domain/orders";
import type { BillSnapshotLine } from "@/lib/domain/order-rules";
import { decideTableAction, type TableAction } from "@/lib/domain/permissions";
import { CLOSED_BILL_WINDOW_MS } from "@/lib/domain/queries";
import { REASON_FROM_DB, type CallWaiterReason } from "@/lib/domain/tables";

export type { TableAction } from "@/lib/domain/permissions";

type StaffActor = { id: string; role: string };

const uuid = z.uuid();

// ---------------------------------------------------------------------------
// Autorización
// ---------------------------------------------------------------------------

export type TableAccess = {
  tableId: string;
  tableNumber: number;
  orderWaiterId: string | null;
  assignedWaiterId: string | null;
};

/**
 * Lanza `NotFoundError("Mesa")` si no existe y `ForbiddenError` si `user` no puede hacer
 * `action` sobre la mesa (regla en `decideTableAction`: ADMIN todo; CASHIER ver y cerrar;
 * WAITER solo si es el mesero de la orden abierta o el asignado mesa→zona).
 */
export async function assertCanActOnTable(user: StaffActor, tableId: string, action: TableAction): Promise<TableAccess> {
  if (!uuid.safeParse(tableId).success) throw new NotFoundError("Mesa");
  const table = await db.table.findUnique({
    where: { id: tableId },
    select: {
      id: true,
      number: true,
      waiterId: true,
      zone: { select: { waiterId: true } },
      orders: { where: { status: "OPEN" }, select: { waiterId: true }, take: 1 },
    },
  });
  if (!table) throw new NotFoundError("Mesa");
  const access: TableAccess = {
    tableId: table.id,
    tableNumber: table.number,
    orderWaiterId: table.orders[0]?.waiterId ?? null,
    assignedWaiterId: table.waiterId ?? table.zone.waiterId ?? null,
  };
  const decision = decideTableAction(user, access, action);
  if (!decision.ok) {
    throw new ForbiddenError(
      decision.reason === "role" ? "Caja puede ver y cerrar cuentas, pero no cambiar los platos" : undefined,
    );
  }
  return access;
}

async function assertCanActOnOrder(user: StaffActor, orderId: string, action: TableAction) {
  if (!uuid.safeParse(orderId).success) throw new NotFoundError("Orden");
  const order = await db.order.findUnique({ where: { id: orderId }, select: { tableId: true } });
  if (!order) throw new NotFoundError("Orden");
  return assertCanActOnTable(user, order.tableId, action);
}

async function assertCanActOnItem(user: StaffActor, itemId: string, action: TableAction) {
  if (!uuid.safeParse(itemId).success) throw new NotFoundError("Ítem");
  const item = await db.orderItem.findUnique({ where: { id: itemId }, select: { order: { select: { tableId: true } } } });
  if (!item) throw new NotFoundError("Ítem");
  return assertCanActOnTable(user, item.order.tableId, action);
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export type StaffItemView = {
  id: string;
  productName: string;
  unitPrice: number; // centavos
  quantity: number;
  notes: string | null;
  status: ItemStatus;
  createdAt: string; // ISO
  servedAt: string | null; // ISO
};
export type StaffRoundView = { round: number; createdAt: string; items: StaffItemView[] };

export type ClosedBillView = {
  orderId: string;
  closedAt: string; // ISO
  closedByName: string;
  subtotal: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
  taxRate: number;
  tipRate: number;
  lines: BillSnapshotLine[];
};

export type TableDetailView = {
  table: {
    id: string;
    number: number;
    seats: number;
    zoneName: string;
    status: TableStatus;
    attentionReason: CallWaiterReason | null;
  };
  /** Orden OPEN (rondas en orden ascendente; la UI decide el orden de pintado). */
  order: {
    id: string;
    status: OrderStatus;
    version: number;
    openedAt: string;
    lastRound: number;
    rounds: StaffRoundView[];
  } | null;
  /** Totales en vivo de la orden abierta (null si no hay). */
  totals: BillTotals | null;
  /** Última cuenta cerrada en las últimas 2 h, solo si no hay orden abierta. */
  closedBill: ClosedBillView | null;
  settings: { taxRate: number; tipRate: number; pricesIncludeTax: boolean; currency: string };
  can: { manage: boolean; close: boolean };
};

export async function getTableDetailForStaff(
  user: StaffActor,
  tableId: string,
  now: Date = new Date(),
): Promise<TableDetailView> {
  const access = await assertCanActOnTable(user, tableId, "view");

  const [table, settingRows] = await Promise.all([
    db.table.findUniqueOrThrow({
      where: { id: tableId },
      select: {
        id: true,
        number: true,
        seats: true,
        status: true,
        attentionReason: true,
        zone: { select: { name: true } },
        orders: {
          where: { status: "OPEN" },
          take: 1,
          select: {
            id: true,
            status: true,
            version: true,
            openedAt: true,
            lastRound: true,
            items: {
              orderBy: [{ round: "asc" }, { createdAt: "asc" }],
              select: {
                id: true,
                productName: true,
                unitPrice: true,
                quantity: true,
                notes: true,
                status: true,
                round: true,
                createdAt: true,
                servedAt: true,
              },
            },
          },
        },
      },
    }),
    db.setting.findMany(),
  ]);
  const settings = parseBillingSettings(settingRows);
  const open = table.orders[0];

  let order: TableDetailView["order"] = null;
  let totals: BillTotals | null = null;
  if (open) {
    const rounds = new Map<number, StaffRoundView>();
    for (const i of open.items) {
      let r = rounds.get(i.round);
      if (!r) rounds.set(i.round, (r = { round: i.round, createdAt: i.createdAt.toISOString(), items: [] }));
      r.items.push({
        id: i.id,
        productName: i.productName,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        notes: i.notes,
        status: i.status,
        createdAt: i.createdAt.toISOString(),
        servedAt: i.servedAt?.toISOString() ?? null,
      });
    }
    order = {
      id: open.id,
      status: open.status,
      version: open.version,
      openedAt: open.openedAt.toISOString(),
      lastRound: open.lastRound,
      rounds: [...rounds.values()].sort((a, b) => a.round - b.round),
    };
    totals = computeBill(open.items, settings);
  }

  let closedBill: ClosedBillView | null = null;
  if (!open) {
    const last = await db.order.findFirst({
      where: { tableId, status: "CLOSED", closedAt: { gte: new Date(now.getTime() - CLOSED_BILL_WINDOW_MS) } },
      orderBy: { closedAt: "desc" },
      select: { id: true, closedAt: true, bill: { include: { closedBy: { select: { name: true } } } } },
    });
    if (last?.bill && last.closedAt) {
      const b = last.bill;
      closedBill = {
        orderId: last.id,
        closedAt: last.closedAt.toISOString(),
        closedByName: b.closedBy.name,
        subtotal: b.subtotal,
        taxAmount: b.taxAmount,
        tipAmount: b.tipAmount,
        total: b.total,
        taxRate: Number(b.taxRate),
        tipRate: Number(b.tipRate),
        lines: b.lines as unknown as BillSnapshotLine[],
      };
    }
  }

  return {
    table: {
      id: table.id,
      number: table.number,
      seats: table.seats,
      zoneName: table.zone.name,
      status: table.status,
      attentionReason:
        table.status === "NEEDS_ATTENTION" && table.attentionReason ? REASON_FROM_DB[table.attentionReason] : null,
    },
    order,
    totals,
    closedBill,
    settings,
    can: {
      manage: decideTableAction(user, access, "manage").ok,
      close: decideTableAction(user, access, "close").ok,
    },
  };
}

// ---------------------------------------------------------------------------
// Mutaciones autorizadas (no publican: devuelven lo necesario para publicar)
// ---------------------------------------------------------------------------

const roundInput = z.object({ orderId: z.uuid(), round: z.number().int().min(1).max(10_000) });
const itemStatusInput = z.object({ itemId: z.uuid(), status: z.enum(["IN_PREPARATION", "SERVED", "CANCELLED"]) });
const staffAddInput = z.object({ tableId: z.uuid(), items: orderItemsInput });
/** Propina como fracción (0.1 = 10 %), máx. 100 %, redondeada a 4 decimales (Decimal(5,4)). */
const closeInput = z.object({
  orderId: z.uuid(),
  tipRate: z
    .number()
    .min(0)
    .max(1)
    .transform((n) => Math.round(n * 10_000) / 10_000),
});

export async function staffConfirmRound(user: StaffActor, raw: unknown): Promise<ConfirmRoundResult> {
  const { orderId, round } = roundInput.parse(raw);
  await assertCanActOnOrder(user, orderId, "manage");
  return confirmRound(orderId, round);
}

export async function staffServeRound(user: StaffActor, raw: unknown): Promise<ConfirmRoundResult> {
  const { orderId, round } = roundInput.parse(raw);
  await assertCanActOnOrder(user, orderId, "manage");
  return serveRound(orderId, round);
}

export async function staffSetItemStatus(user: StaffActor, raw: unknown): Promise<ItemMutationResult> {
  const { itemId, status } = itemStatusInput.parse(raw);
  await assertCanActOnItem(user, itemId, "manage");
  return setItemStatus(itemId, status);
}

export async function staffCancelItem(user: StaffActor, raw: unknown): Promise<ItemMutationResult> {
  const { itemId } = z.object({ itemId: z.uuid() }).parse(raw);
  await assertCanActOnItem(user, itemId, "manage");
  return cancelItem(itemId);
}

export async function staffAddItems(user: StaffActor, raw: unknown): Promise<AddItemsResult> {
  const { tableId, items } = staffAddInput.parse(raw);
  await assertCanActOnTable(user, tableId, "manage");
  return addItemsToOrderByTableId({ tableId, items });
}

export async function staffCloseService(user: StaffActor, raw: unknown): Promise<CloseOrderResult> {
  const { orderId, tipRate } = closeInput.parse(raw);
  await assertCanActOnOrder(user, orderId, "close");
  return closeOrder(orderId, user.id, { tipRate });
}
