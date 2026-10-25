import { describe, expect, it } from "vitest";
import { deriveCustomerStatus } from "@/lib/domain/order-status";

describe("deriveCustomerStatus", () => {
  it("orden CLOSED → CLOSED aunque haya ítems sin servir", () => {
    expect(deriveCustomerStatus("CLOSED", ["PENDING", "SERVED"])).toBe("CLOSED");
  });

  it("orden CANCELLED → CLOSED", () => {
    expect(deriveCustomerStatus("CANCELLED", ["PENDING"])).toBe("CLOSED");
  });

  it("algún ítem PENDING → IN_PREPARATION", () => {
    expect(deriveCustomerStatus("OPEN", ["SERVED", "PENDING"])).toBe("IN_PREPARATION");
  });

  it("algún ítem IN_PREPARATION → IN_PREPARATION", () => {
    expect(deriveCustomerStatus("OPEN", ["IN_PREPARATION", "SERVED"])).toBe("IN_PREPARATION");
  });

  it("todos los activos SERVED → SERVED", () => {
    expect(deriveCustomerStatus("OPEN", ["SERVED", "SERVED"])).toBe("SERVED");
  });

  it("ignora los CANCELLED", () => {
    expect(deriveCustomerStatus("OPEN", ["SERVED", "CANCELLED"])).toBe("SERVED");
  });

  it("sin ítems activos (vacía o todo cancelado) → IN_PREPARATION", () => {
    expect(deriveCustomerStatus("OPEN", [])).toBe("IN_PREPARATION");
    expect(deriveCustomerStatus("OPEN", ["CANCELLED", "CANCELLED"])).toBe("IN_PREPARATION");
  });
});
