import { describe, expect, it } from "vitest";
import { parsePaymentAmount } from "@/lib/payment-methods";

describe("importes de pago en pesos", () => {
  it.each([
    ["10000", 1_000_000],
    ["10000,50", 1_000_050],
    ["10000.05", 1_000_005],
    ["0", 0],
    [" 25,5 ", 2550],
    ["", null],
    ["-10", null],
    ["10.000", null],
    ["1e3", null],
    ["21474836,48", null],
  ])("convierte %s a centavos enteros", (input, expected) => {
    expect(parsePaymentAmount(String(input))).toBe(expected);
  });
});
