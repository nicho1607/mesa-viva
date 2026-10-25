// Estado visible para el cliente (docs/ARQUITECTURA.md, sección 3). Función pura.

export type CustomerStatus = "IN_PREPARATION" | "SERVED" | "CLOSED";

export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  IN_PREPARATION: "En preparación",
  SERVED: "Servido",
  CLOSED: "Servicio finalizado",
};

/**
 * - Orden no OPEN (CLOSED o CANCELLED) → "CLOSED" (ya no admite pedidos).
 * - Ítems CANCELLED se ignoran.
 * - Todos los ítems activos SERVED (y al menos uno) → "SERVED".
 * - En otro caso → "IN_PREPARATION". Una orden abierta sin ítems activos
 *   (p.ej. todo cancelado) también devuelve "IN_PREPARATION": la mesa sigue
 *   abierta y no hay nada servido que mostrar.
 */
export function deriveCustomerStatus(
  orderStatus: string,
  itemStatuses: readonly string[],
): CustomerStatus {
  if (orderStatus !== "OPEN") return "CLOSED";
  const active = itemStatuses.filter((s) => s !== "CANCELLED");
  if (active.length > 0 && active.every((s) => s === "SERVED")) return "SERVED";
  return "IN_PREPARATION";
}
