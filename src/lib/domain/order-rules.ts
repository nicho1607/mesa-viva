// Reglas puras del ciclo de vida de ítems y del snapshot de la cuenta (sin BD).

export type ItemStatusName = "PENDING" | "IN_PREPARATION" | "SERVED" | "CANCELLED";

/** PENDING → IN_PREPARATION → SERVED; cualquier ítem no servido puede cancelarse. */
const ITEM_TRANSITIONS: Record<ItemStatusName, readonly ItemStatusName[]> = {
  PENDING: ["IN_PREPARATION", "CANCELLED"],
  IN_PREPARATION: ["SERVED", "CANCELLED"],
  SERVED: [],
  CANCELLED: [],
};

export function canTransitionItem(from: string, to: string): boolean {
  const allowed = ITEM_TRANSITIONS[from as ItemStatusName];
  return allowed !== undefined && allowed.includes(to as ItemStatusName);
}

export type BillSnapshotLine = {
  productId: string;
  productName: string;
  unitPrice: number; // centavos
  quantity: number;
  notes: string | null;
  lineTotal: number; // centavos
};

type SnapshotSource = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  notes: string | null;
  status: string;
};

/**
 * Agrupa los ítems no cancelados por producto + precio unitario + nota,
 * en el orden en que aparecieron por primera vez. Es lo que se guarda en `Bill.lines`.
 */
export function groupBillLines(items: readonly SnapshotSource[]): BillSnapshotLine[] {
  const groups = new Map<string, BillSnapshotLine>();
  for (const i of items) {
    if (i.status === "CANCELLED") continue;
    const notes = i.notes?.trim() ? i.notes.trim() : null;
    const key = JSON.stringify([i.productId, i.unitPrice, notes]);
    const g = groups.get(key);
    if (g) {
      g.quantity += i.quantity;
      g.lineTotal += i.unitPrice * i.quantity;
    } else {
      groups.set(key, {
        productId: i.productId,
        productName: i.productName,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        notes,
        lineTotal: i.unitPrice * i.quantity,
      });
    }
  }
  return [...groups.values()];
}
