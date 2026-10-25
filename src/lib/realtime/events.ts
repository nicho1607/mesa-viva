// Contrato de eventos en tiempo real (compartido servidor/cliente; sin dependencias).
// Modelo "señal + refetch": el evento solo avisa; el cliente vuelve a pedir sus datos.

/** Canal de pg_notify por el que viajan todas las señales. */
export const PG_CHANNEL = "mesa_viva";

export const REALTIME_EVENTS = [
  "order.opened",
  "order.items_added",
  "order.item_status_changed",
  "order.closed",
  "waiter.called",
  "order.unassigned",
] as const;
export type RealtimeEvent = (typeof REALTIME_EVENTS)[number];

export function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  return typeof value === "string" && (REALTIME_EVENTS as readonly string[]).includes(value);
}

/** Canal de staff que ve todo el salón (admin/caja) y las órdenes sin mesero. */
export const FLOOR_CHANNEL = "staff:floor";
export const tableChannel = (tableId: string) => `table:${tableId}`;
export const waiterChannel = (userId: string) => `waiter:${userId}`;

/**
 * Payload permitido: solo identificadores y contadores. Nunca precios, ítems ni datos
 * de otras mesas. `publish` además elimina en runtime cualquier otra clave.
 */
export type RealtimePayload = {
  orderId?: string;
  tableId?: string;
  tableNumber?: number;
  round?: number;
  version?: number;
};

const STRING_FIELDS = ["orderId", "tableId"] as const;
const NUMBER_FIELDS = ["tableNumber", "round", "version"] as const;

/** Whitelist en runtime: copia solo los campos permitidos y con el tipo correcto. */
export function sanitizePayload(input: unknown): RealtimePayload {
  const out: RealtimePayload = {};
  if (!input || typeof input !== "object") return out;
  const src = input as Record<string, unknown>;
  for (const key of STRING_FIELDS) {
    const v = src[key];
    if (typeof v === "string") out[key] = v;
  }
  for (const key of NUMBER_FIELDS) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

/** Mensaje tal como viaja por pg_notify. */
export type RealtimeMessage = { channel: string; event: RealtimeEvent; payload: RealtimePayload };
