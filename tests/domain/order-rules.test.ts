import { describe, expect, it } from "vitest";
import { canTransitionItem, groupBillLines } from "@/lib/domain/order-rules";

describe("canTransitionItem", () => {
  it.each([
    ["PENDING", "IN_PREPARATION", true],
    ["IN_PREPARATION", "SERVED", true],
    ["PENDING", "CANCELLED", true],
    ["IN_PREPARATION", "CANCELLED", true],
    ["PENDING", "SERVED", false],
    ["SERVED", "CANCELLED", false],
    ["SERVED", "PENDING", false],
    ["CANCELLED", "PENDING", false],
    ["IN_PREPARATION", "PENDING", false],
    ["PENDING", "PENDING", false],
    ["X", "SERVED", false],
  ])("%s → %s = %s", (from, to, ok) => {
    expect(canTransitionItem(from, to)).toBe(ok);
  });
});

describe("groupBillLines", () => {
  const base = { productId: "p1", productName: "Arepa", unitPrice: 500, quantity: 1, notes: null, status: "SERVED" };

  it("agrupa por producto + precio + nota y excluye cancelados", () => {
    const lines = groupBillLines([
      base,
      { ...base, quantity: 2 },
      { ...base, notes: " Sin queso " },
      { ...base, notes: "" },
      { ...base, unitPrice: 600 },
      { ...base, status: "CANCELLED", quantity: 5 },
      { ...base, productId: "p2", productName: "Jugo" },
    ]);
    expect(lines).toEqual([
      { productId: "p1", productName: "Arepa", unitPrice: 500, quantity: 4, notes: null, lineTotal: 2000 },
      { productId: "p1", productName: "Arepa", unitPrice: 500, quantity: 1, notes: "Sin queso", lineTotal: 500 },
      { productId: "p1", productName: "Arepa", unitPrice: 600, quantity: 1, notes: null, lineTotal: 600 },
      { productId: "p2", productName: "Jugo", unitPrice: 500, quantity: 1, notes: null, lineTotal: 500 },
    ]);
  });
});
