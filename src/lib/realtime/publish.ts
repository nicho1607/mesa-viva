import { db } from "@/lib/db";
import {
  FLOOR_CHANNEL,
  PG_CHANNEL,
  isRealtimeEvent,
  sanitizePayload,
  tableChannel,
  waiterChannel,
  type RealtimeEvent,
  type RealtimeMessage,
  type RealtimePayload,
} from "./events";

/**
 * Emite una señal por pg_notify. Llamar SIEMPRE después del commit de la mutación.
 * Nunca lanza: si falla solo se registra (el cliente se corrige con el refetch al reconectar).
 */
export async function publish(
  channel: string,
  event: RealtimeEvent,
  payload: RealtimePayload = {},
): Promise<void> {
  try {
    if (!isRealtimeEvent(event)) throw new Error(`evento desconocido: ${String(event)}`);
    const msg: RealtimeMessage = { channel, event, payload: sanitizePayload(payload) };
    await db.$executeRaw`SELECT pg_notify(${PG_CHANNEL}, ${JSON.stringify(msg)})`;
  } catch (e) {
    console.error("[realtime] publish falló", { channel, event }, e);
  }
}

/** Publica el mismo evento en varios canales (sin duplicados). Nunca lanza. */
export async function publishMany(
  channels: string[],
  event: RealtimeEvent,
  payload: RealtimePayload = {},
): Promise<void> {
  await Promise.all([...new Set(channels)].map((c) => publish(c, event, payload)));
}

/**
 * Canales que deben recibir un evento de orden: la mesa (cliente), el mesero asignado
 * y siempre el salón (admin/caja). Sin mesero, el salón recibe además `order.unassigned`.
 */
export function orderEventChannels(tableId: string, waiterId: string | null | undefined): string[] {
  const channels = [tableChannel(tableId), FLOOR_CHANNEL];
  if (waiterId) channels.push(waiterChannel(waiterId));
  return channels;
}

/**
 * Atajo para Server Actions tras una mutación de `@/lib/domain/orders`:
 * `await publishOrderEvent({ tableId, waiterId, event: "order.items_added", payload: { orderId, version, tableNumber, round } })`.
 * Si la orden no tiene mesero, también emite `order.unassigned` al salón.
 */
export async function publishOrderEvent(args: {
  tableId: string;
  waiterId: string | null | undefined;
  event: RealtimeEvent;
  payload?: RealtimePayload;
}): Promise<void> {
  const payload: RealtimePayload = { tableId: args.tableId, ...args.payload };
  const channels = orderEventChannels(args.tableId, args.waiterId);
  try {
    const table = await db.table.findUnique({
      where: { id: args.tableId },
      select: { waiterId: true, zone: { select: { waiterId: true } } },
    });
    const assigned = table?.waiterId ?? table?.zone.waiterId;
    if (assigned) channels.push(waiterChannel(assigned));
  } catch (e) {
    console.error("[realtime] no se pudo resolver el mesero actual", e);
  }
  await publishMany(channels, args.event, payload);
  if (!args.waiterId && args.event !== "order.unassigned" && args.event !== "order.closed") {
    await publish(FLOOR_CHANNEL, "order.unassigned", payload);
  }
}
