import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/money";

// Intl usa espacios no separables; normalizamos para comparar.
const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("formatMoney", () => {
  it("COP en es-CO sin decimales y con separador de miles", () => {
    expect(norm(formatMoney(1_250_000))).toBe("$ 12.500");
  });

  it("redondea centavos en COP", () => {
    expect(norm(formatMoney(1_250_099))).toBe("$ 12.501");
  });

  it("cero", () => {
    expect(norm(formatMoney(0))).toBe("$ 0");
  });

  it("otras monedas con 2 decimales", () => {
    expect(norm(formatMoney(123_456, "USD", "en-US"))).toBe("$1,234.56");
    expect(norm(formatMoney(5_000, "MXN", "es-MX"))).toBe("$50.00");
  });
});
