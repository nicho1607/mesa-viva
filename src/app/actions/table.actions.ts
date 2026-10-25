"use server";

// Server Actions del detalle de mesa (staff). Capa delgada: requireStaff → dominio autorizado
// (`@/lib/domain/staff-table`, que aplica assertCanActOnTable) → publicar tras el commit.

import { unstable_rethrow } from "next/navigation";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { requireStaff, UnauthorizedError } from "@/lib/auth";
import type { SubmitOrderItem } from "@/app/actions/order.actions";
import {
  getTableDetailForStaff,
  staffAddItems,
  staffCancelItem,
  staffCloseService,
  staffConfirmRound,
  staffServeRound,
  staffSetItemStatus,
  type TableDetailView,
} from "@/lib/domain/staff-table";
import type { OrderMutationResult } from "@/lib/domain/orders";
import { publishOrderEvent } from "@/lib/realtime/publish";

function fail(e: unknown) {
  unstable_rethrow(e); // el redirect a /staff/login de requireStaff debe propagarse
  if (e instanceof UnauthorizedError) return { ok: false as const, error: e.message, code: e.code };
  return toActionError(e);
}

function publishStatusChange(r: OrderMutationResult & { round?: number }) {
  return publishOrderEvent({
    tableId: r.tableId,
    waiterId: r.waiterId,
    event: "order.item_status_changed",
    payload: { orderId: r.orderId, tableNumber: r.tableNumber, version: r.version, ...(r.round ? { round: r.round } : {}) },
  });
}

/** Detalle de la mesa (lo usa el refetch del cliente). */
export async function getTableDetail(tableId: string): Promise<ActionResult<TableDetailView>> {
  try {
    const user = await requireStaff();
    return { ok: true, data: await getTableDetailForStaff(user, tableId) };
  } catch (e) {
    return fail(e);
  }
}

/** "Confirmar ronda": PENDING → IN_PREPARATION. */
export async function confirmRoundAction(orderId: string, round: number): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requireStaff();
    const r = await staffConfirmRound(user, { orderId, round });
    if (r.count > 0) await publishStatusChange(r);
    return { ok: true, data: { count: r.count } };
  } catch (e) {
    return fail(e);
  }
}

/** "Ronda servida": IN_PREPARATION → SERVED en toda la ronda. */
export async function serveRoundAction(orderId: string, round: number): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requireStaff();
    const r = await staffServeRound(user, { orderId, round });
    if (r.count > 0) await publishStatusChange(r);
    return { ok: true, data: { count: r.count } };
  } catch (e) {
    return fail(e);
  }
}

/** Cambia el estado de un ítem (IN_PREPARATION / SERVED / CANCELLED). */
export async function setItemStatusAction(
  itemId: string,
  status: "IN_PREPARATION" | "SERVED" | "CANCELLED",
): Promise<ActionResult<{ status: string }>> {
  try {
    const user = await requireStaff();
    const r = await staffSetItemStatus(user, { itemId, status });
    await publishStatusChange(r);
    return { ok: true, data: { status: r.status } };
  } catch (e) {
    return fail(e);
  }
}

/** Cancela un ítem no servido. */
export async function cancelItemAction(itemId: string): Promise<ActionResult<{ status: string }>> {
  try {
    const user = await requireStaff();
    const r = await staffCancelItem(user, { itemId });
    await publishStatusChange(r);
    return { ok: true, data: { status: r.status } };
  } catch (e) {
    return fail(e);
  }
}

/** El mesero añade una ronda en nombre del cliente (abre la orden si no hay). */
export async function addItemsForTableAction(
  tableId: string,
  items: SubmitOrderItem[],
): Promise<ActionResult<{ orderId: string; round: number }>> {
  try {
    const user = await requireStaff();
    const r = await staffAddItems(user, { tableId, items });
    await publishOrderEvent({
      tableId: r.tableId,
      waiterId: r.waiterId,
      event: r.isNew ? "order.opened" : "order.items_added",
      payload: { orderId: r.orderId, tableNumber: r.tableNumber, round: r.round, version: r.version },
    });
    return { ok: true, data: { orderId: r.orderId, round: r.round } };
  } catch (e) {
    return fail(e);
  }
}

/** "Finalizar servicio": crea la Bill, orden CLOSED, mesa AVAILABLE. `tipRate` en fracción (0.1 = 10 %). */
export async function closeServiceAction(
  orderId: string,
  tipRate: number,
): Promise<ActionResult<{ total: number; unservedCount: number }>> {
  try {
    const user = await requireStaff(["WAITER", "CASHIER"]);
    const r = await staffCloseService(user, { orderId, tipRate });
    await publishOrderEvent({
      tableId: r.tableId,
      waiterId: r.waiterId,
      event: "order.closed",
      payload: { orderId: r.orderId, tableNumber: r.tableNumber, version: r.version },
    });
    return { ok: true, data: { total: r.bill.total, unservedCount: r.unservedCount } };
  } catch (e) {
    return fail(e);
  }
}
