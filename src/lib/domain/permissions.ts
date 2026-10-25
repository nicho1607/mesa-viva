// Quién puede hacer qué sobre una mesa (regla pura, sin BD; la usa `assertCanActOnTable`).
//
// - ADMIN: todo.
// - WAITER: solo sus mesas = mesero de la orden abierta, o el asignado a la mesa
//   (directo; si no hay, el de la zona). Puede ver, gestionar ítems y cerrar.
// - CASHIER: ve y cierra cualquier mesa (cobra), pero no cambia estados de ítems ni añade.

export type TableAction = "view" | "manage" | "close";

export type TableResponsibility = {
  /** Mesero de la orden OPEN (si hay). */
  orderWaiterId: string | null;
  /** `table.waiterId ?? zone.waiterId`. */
  assignedWaiterId: string | null;
};

export type PermissionDecision = { ok: true } | { ok: false; reason: "not_responsible" | "role" };

export function isResponsibleWaiter(userId: string, r: TableResponsibility): boolean {
  return userId === r.orderWaiterId || userId === r.assignedWaiterId;
}

export function decideTableAction(
  user: { id: string; role: string },
  r: TableResponsibility,
  action: TableAction,
): PermissionDecision {
  if (user.role === "ADMIN") return { ok: true };
  if (user.role === "CASHIER") return action === "manage" ? { ok: false, reason: "role" } : { ok: true };
  if (user.role === "WAITER") return isResponsibleWaiter(user.id, r) ? { ok: true } : { ok: false, reason: "not_responsible" };
  return { ok: false, reason: "role" };
}
