// Lógica pura de presentación del plano de mesas (sin React ni BD).

import type { RealtimeEvent, RealtimePayload } from "@/lib/realtime/events";

export type TileKind = "bill" | "assistance" | "pending" | "occupied" | "free";

export type TileInput = {
  status: string;
  attentionReason: "assistance" | "bill" | null;
  order: { pendingCount: number } | null;
};

export const TILE_LABEL: Record<TileKind, string> = {
  bill: "Piden la cuenta",
  assistance: "Te llaman",
  pending: "Ronda sin confirmar",
  occupied: "Ocupada",
  free: "Libre",
};

/** Prioridad: la llamada (cuenta / ayuda) > ronda sin confirmar > ocupada > libre. */
export function tileKind(t: TileInput): TileKind {
  if (t.status === "NEEDS_ATTENTION") return t.attentionReason === "bill" ? "bill" : "assistance";
  if (t.order && t.order.pendingCount > 0) return "pending";
  if (t.order || t.status === "OCCUPIED") return "occupied";
  return "free";
}

export const needsAck = (kind: TileKind) => kind === "bill" || kind === "assistance";

/** "Recién abierta" · "Hace 25 min" · "Hace 1 h 05 min". */
export function openedLabel(openedAtIso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(openedAtIso).getTime()) / 60_000));
  if (mins < 1) return "Recién abierta";
  if (mins < 60) return `Hace ${mins} min`;
  const h = Math.floor(mins / 60);
  return `Hace ${h} h ${String(mins % 60).padStart(2, "0")} min`;
}

/** Texto del aviso para un evento, o null si ese evento no merece aviso. */
export function toastFor(event: RealtimeEvent, p: RealtimePayload): { text: string; tone: "round" | "call" } | null {
  if (typeof p.tableNumber !== "number") return null;
  const mesa = `Mesa ${p.tableNumber}`;
  if (event === "order.opened" || event === "order.items_added") {
    return { text: typeof p.round === "number" ? `${mesa} · Ronda ${p.round}` : `${mesa} hizo un pedido`, tone: "round" };
  }
  if (event === "waiter.called") {
    return { text: p.reason === "bill" ? `${mesa} pide la cuenta` : `${mesa} te llama`, tone: "call" };
  }
  return null;
}

export const ROLE_LABEL: Record<string, string> = {
  WAITER: "Mesero",
  ADMIN: "Administrador",
  CASHIER: "Caja",
};
