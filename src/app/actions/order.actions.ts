"use server";

// Server Actions del cliente (QR). Capa delgada: rate limit → dominio → publicar tras commit.
// Solo se identifica con el token público de la mesa. Nunca se aceptan precios del cliente:
// `orderItemsInput` (Zod) descarta cualquier campo que no sea productId/quantity/notes.

import { toActionError, type ActionResult } from "@/lib/action-result";
import { addItemsToOrder } from "@/lib/domain/orders";
import {
  findPublicTable,
  getMenuData,
  getTableBillData,
  type MenuCategory,
  type PublicTable,
  type TableBillView,
} from "@/lib/domain/queries";
import { requestWaiter, type CallWaiterReason } from "@/lib/domain/tables";
import { FLOOR_CHANNEL, waiterChannel } from "@/lib/realtime/events";
import { publishMany, publishOrderEvent } from "@/lib/realtime/publish";
import { enforceRateLimit, getRateLimiter } from "@/lib/rate-limit";

const MINUTE = 60_000;
const submitLimiter = () => getRateLimiter("submitOrder", { limit: 10, windowMs: MINUTE });
const callWaiterLimiter = () => getRateLimiter("callWaiter", { limit: 3, windowMs: MINUTE });

const rateKey = (token: unknown) => (typeof token === "string" ? token.slice(0, 128) : "<invalid>");

/** Menú completo (incluye agotados con `available: false`). Precios en centavos. */
export async function getMenu(): Promise<MenuCategory[]> {
  return getMenuData();
}

/** Info pública de la mesa (`{ id, number, status }`) o null si el token no vale / está INACTIVE. */
export async function getTableByToken(token: string): Promise<PublicTable | null> {
  return findPublicTable(token);
}

export type SubmitOrderItem = { productId: string; quantity: number; notes?: string };

/** Envía una ronda. Abre la orden si no hay una OPEN. */
export async function submitOrder(
  token: string,
  items: SubmitOrderItem[],
): Promise<ActionResult<{ orderId: string; round: number }>> {
  try {
    enforceRateLimit(submitLimiter(), rateKey(token));
    const r = await addItemsToOrder({ token, items });
    await publishOrderEvent({
      tableId: r.tableId,
      waiterId: r.waiterId,
      event: r.isNew ? "order.opened" : "order.items_added",
      payload: { orderId: r.orderId, tableNumber: r.tableNumber, round: r.round, version: r.version },
    });
    return { ok: true, data: { orderId: r.orderId, round: r.round } };
  } catch (e) {
    return toActionError(e);
  }
}

/** Cuenta en vivo (orden OPEN) o la última cerrada en las últimas 2 h. */
export async function getTableBill(token: string): Promise<ActionResult<TableBillView>> {
  try {
    return { ok: true, data: await getTableBillData(token) };
  } catch (e) {
    return toActionError(e);
  }
}

/** Llama al mesero (ayuda o pedir la cuenta): mesa NEEDS_ATTENTION + `waiter.called`. */
export async function callWaiter(
  token: string,
  reason: CallWaiterReason = "assistance",
): Promise<ActionResult<{ tableNumber: number }>> {
  try {
    enforceRateLimit(callWaiterLimiter(), rateKey(token));
    const r = await requestWaiter({ token, reason });
    const channels = [FLOOR_CHANNEL];
    if (r.waiterId) channels.push(waiterChannel(r.waiterId));
    await publishMany(channels, "waiter.called", {
      tableId: r.tableId,
      tableNumber: r.tableNumber,
      ...(r.orderId ? { orderId: r.orderId } : {}),
    });
    return { ok: true, data: { tableNumber: r.tableNumber } };
  } catch (e) {
    return toActionError(e);
  }
}
