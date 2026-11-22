// Reglas puras del inventario de porciones vendibles.

export type PortionDemand = { productId: string; quantity: number };

/** null conserva el comportamiento anterior: producto sin control cuantitativo. */
export function isProductSellable(available: boolean, availableQuantity: number | null): boolean {
  return available && (availableQuantity === null || availableQuantity > 0);
}

/** Suma por producto, aunque las líneas tengan notas distintas. */
export function aggregatePortionDemand(items: readonly PortionDemand[]): Map<string, number> {
  const demand = new Map<string, number>();
  for (const item of items) {
    demand.set(item.productId, (demand.get(item.productId) ?? 0) + item.quantity);
  }
  return demand;
}

export function inventoryLabel(available: boolean, availableQuantity: number | null): string {
  if (!available) return "No disponible manualmente";
  if (availableQuantity === null) return "Sin control de porciones";
  if (availableQuantity === 0) return "Agotado";
  return `${availableQuantity} ${availableQuantity === 1 ? "porción" : "porciones"}`;
}
