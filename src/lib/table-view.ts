// Lógica pura de presentación del detalle de mesa (sin React ni BD).

export type ViewItem = { status: string; quantity: number };

export const ITEM_STATUS_LABEL: Record<string, string> = {
  PENDING: "Por confirmar",
  IN_PREPARATION: "En cocina",
  SERVED: "Servido",
  CANCELLED: "Cancelado",
};

/** Qué botones ofrece una ronda. */
export function roundActions(items: readonly ViewItem[]) {
  const pending = items.filter((i) => i.status === "PENDING").length;
  const inPrep = items.filter((i) => i.status === "IN_PREPARATION").length;
  return { canConfirm: pending > 0, canServe: inPrep > 0, pending, inPrep };
}

/** Qué botones ofrece un ítem: "Servido" solo desde cocina, "Cancelar" si no está servido. */
export function itemActions(status: string) {
  return {
    canServe: status === "IN_PREPARATION",
    canCancel: status === "PENDING" || status === "IN_PREPARATION",
  };
}

/** Productos (sumando cantidades) aún sin servir: PENDING o IN_PREPARATION. */
export function unservedCount(rounds: readonly { items: readonly ViewItem[] }[]): number {
  return rounds
    .flatMap((r) => r.items)
    .filter((i) => i.status === "PENDING" || i.status === "IN_PREPARATION")
    .reduce((n, i) => n + i.quantity, 0);
}

/** Rondas de la más reciente a la más antigua (sin mutar). */
export function newestFirst<T extends { round: number }>(rounds: readonly T[]): T[] {
  return [...rounds].sort((a, b) => b.round - a.round);
}

/**
 * Porcentaje de propina escrito por el mesero ("12", "12,5", "7.5 %") → fracción (0.125).
 * null si no es un número entre 0 y 100.
 */
export function parseTipPercent(input: string): number | null {
  const clean = input.replace(/%/g, "").trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(clean)) return null;
  const n = Number(clean);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 10_000;
}

/** Fracción → texto de porcentaje para mostrar ("10", "12,5"). */
export function percentLabel(rate: number): string {
  const pct = Math.round(rate * 10_000) / 100;
  return String(pct).replace(".", ",");
}

const clock = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" });

/** Hora local del restaurante ("14:05"); zona fija para que servidor y cliente coincidan. */
export function formatClock(iso: string): string {
  return clock.format(new Date(iso));
}
