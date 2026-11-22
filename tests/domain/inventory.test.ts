import { describe, expect, it } from "vitest";
import { aggregatePortionDemand, inventoryLabel, isProductSellable } from "@/lib/domain/inventory";

describe("inventario de porciones", () => {
  it("combina el control manual con el saldo", () => {
    expect(isProductSellable(false, null)).toBe(false);
    expect(isProductSellable(false, 5)).toBe(false);
    expect(isProductSellable(true, null)).toBe(true);
    expect(isProductSellable(true, 1)).toBe(true);
    expect(isProductSellable(true, 0)).toBe(false);
  });

  it("suma la demanda del mismo producto aunque cambien las notas", () => {
    const demand = aggregatePortionDemand([
      { productId: "ajiaco", quantity: 2 },
      { productId: "jugo", quantity: 1 },
      { productId: "ajiaco", quantity: 2 },
    ]);
    expect([...demand.entries()]).toEqual([["ajiaco", 4], ["jugo", 1]]);
  });

  it("explica los estados sin confundir retirado y agotado", () => {
    expect(inventoryLabel(false, 8)).toBe("No disponible manualmente");
    expect(inventoryLabel(true, null)).toBe("Sin control de porciones");
    expect(inventoryLabel(true, 0)).toBe("Agotado");
    expect(inventoryLabel(true, 1)).toBe("1 porción");
    expect(inventoryLabel(true, 3)).toBe("3 porciones");
  });
});
