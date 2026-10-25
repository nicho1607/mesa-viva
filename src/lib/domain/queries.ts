// Consultas de lectura para el cliente (menú, mesa, cuenta). Sin Next: testeables con Vitest.
// Nunca exponen datos internos (token, mesero, otras mesas).

import { db } from "@/lib/db";
import type { ItemStatus, OrderStatus, TableStatus } from "@/generated/prisma/client";
import { computeBill, parseBillingSettings, type BillTotals } from "@/lib/domain/billing";
import { InvalidTableError } from "@/lib/domain/errors";
import { deriveCustomerStatus, type CustomerStatus } from "@/lib/domain/order-status";

/** Ventana en la que el cliente todavía ve la cuenta de una orden cerrada. */
export const CLOSED_BILL_WINDOW_MS = 2 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Menú
// ---------------------------------------------------------------------------

export type MenuProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number; // centavos
  imageUrl: string | null;
  available: boolean; // false = "Agotado" (se muestra, no se puede pedir)
};
export type MenuCategory = { id: string; name: string; products: MenuProduct[] };

/** Categorías (con productos) ordenadas por sortOrder, nombre; productos igual. */
export async function getMenuData(): Promise<MenuCategory[]> {
  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      products: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, description: true, price: true, imageUrl: true, available: true },
      },
    },
  });
  return categories.filter((c) => c.products.length > 0);
}

// ---------------------------------------------------------------------------
// Mesa por token
// ---------------------------------------------------------------------------

export type PublicTable = { id: string; number: number; status: TableStatus };

function isPlausibleToken(token: unknown): token is string {
  return typeof token === "string" && token.length >= 1 && token.length <= 128;
}

/** Info pública de la mesa; null si el token no existe o la mesa está INACTIVE. */
export async function findPublicTable(token: unknown): Promise<PublicTable | null> {
  if (!isPlausibleToken(token)) return null;
  const table = await db.table.findUnique({
    where: { publicToken: token },
    select: { id: true, number: true, status: true },
  });
  if (!table || table.status === "INACTIVE") return null;
  return table;
}

// ---------------------------------------------------------------------------
// Cuenta de la mesa
// ---------------------------------------------------------------------------

export type BillItemView = {
  id: string;
  productName: string;
  unitPrice: number; // centavos (snapshot)
  quantity: number;
  notes: string | null;
  status: ItemStatus;
};
export type BillRoundView = { round: number; items: BillItemView[] };
export type BillTotalsView = BillTotals & { taxRate: number; tipRate: number; pricesIncludeTax: boolean };

export type TableBillView =
  | { table: { number: number }; order: null; currency: string }
  | {
      table: { number: number };
      order: { id: string; status: OrderStatus; version: number; rounds: BillRoundView[] };
      totals: BillTotalsView;
      customerStatus: CustomerStatus;
      currency: string;
    };

const itemSelect = {
  id: true,
  productName: true,
  unitPrice: true,
  quantity: true,
  notes: true,
  status: true,
  round: true,
} as const;

function groupByRound(items: (BillItemView & { round: number })[]): BillRoundView[] {
  const rounds = new Map<number, BillItemView[]>();
  for (const { round, ...item } of items) {
    let list = rounds.get(round);
    if (!list) rounds.set(round, (list = []));
    list.push(item);
  }
  return [...rounds.entries()].sort((a, b) => a[0] - b[0]).map(([round, list]) => ({ round, items: list }));
}

/**
 * Cuenta visible para el cliente: la orden OPEN de la mesa (totales vía computeBill) o,
 * si no hay, la última CLOSED cerrada hace menos de 2 h (totales del `Bill` guardado).
 * Lanza `InvalidTableError` si el token no es válido o la mesa está INACTIVE.
 */
export async function getTableBillData(token: unknown, now: Date = new Date()): Promise<TableBillView> {
  const table = await findPublicTable(token);
  if (!table) throw new InvalidTableError();

  const settings = parseBillingSettings(await db.setting.findMany());
  const currency = settings.currency;

  const orderSelect = {
    id: true,
    status: true,
    version: true,
    bill: true,
    items: { select: itemSelect, orderBy: [{ round: "asc" as const }, { createdAt: "asc" as const }] },
  };

  const order =
    (await db.order.findFirst({ where: { tableId: table.id, status: "OPEN" }, select: orderSelect })) ??
    (await db.order.findFirst({
      where: {
        tableId: table.id,
        status: "CLOSED",
        closedAt: { gte: new Date(now.getTime() - CLOSED_BILL_WINDOW_MS) },
      },
      orderBy: { closedAt: "desc" },
      select: orderSelect,
    }));

  const tableView = { number: table.number };
  if (!order) return { table: tableView, order: null, currency };

  let totals: BillTotalsView;
  if (order.status !== "OPEN" && order.bill) {
    const b = order.bill;
    totals = {
      subtotal: b.subtotal,
      taxAmount: b.taxAmount,
      tipAmount: b.tipAmount,
      total: b.total,
      taxRate: Number(b.taxRate),
      tipRate: Number(b.tipRate),
      pricesIncludeTax: settings.pricesIncludeTax,
    };
  } else {
    totals = {
      ...computeBill(order.items, settings),
      taxRate: settings.taxRate,
      tipRate: settings.tipRate,
      pricesIncludeTax: settings.pricesIncludeTax,
    };
  }

  return {
    table: tableView,
    order: { id: order.id, status: order.status, version: order.version, rounds: groupByRound(order.items) },
    totals,
    customerStatus: deriveCustomerStatus(
      order.status,
      order.items.map((i) => i.status),
    ),
    currency,
  };
}
