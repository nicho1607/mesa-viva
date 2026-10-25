import { describe, expect, it } from "vitest";
import {
  computeBill,
  DEFAULT_BILLING_SETTINGS,
  parseBillingSettings,
  type BillLine,
} from "@/lib/domain/billing";

const excl = { taxRate: 0.19, tipRate: 0.1, pricesIncludeTax: false };
const incl = { taxRate: 0.19, tipRate: 0.1, pricesIncludeTax: true };

describe("computeBill", () => {
  it("cuenta vacía → todo en cero", () => {
    expect(computeBill([], excl)).toEqual({ subtotal: 0, taxAmount: 0, tipAmount: 0, total: 0 });
    expect(computeBill([], incl)).toEqual({ subtotal: 0, taxAmount: 0, tipAmount: 0, total: 0 });
  });

  it("excluye ítems CANCELLED", () => {
    const items: BillLine[] = [
      { unitPrice: 1_000_000, quantity: 2, status: "SERVED" },
      { unitPrice: 500_000, quantity: 1, status: "CANCELLED" },
      { unitPrice: 300_000, quantity: 1, status: "PENDING" },
    ];
    expect(computeBill(items, excl).subtotal).toBe(2_300_000);
  });

  it("solo cancelados → cero", () => {
    const items: BillLine[] = [{ unitPrice: 990_000, quantity: 3, status: "CANCELLED" }];
    expect(computeBill(items, incl).total).toBe(0);
  });

  it("impuesto NO incluido: total = subtotal + iva + propina", () => {
    const items: BillLine[] = [{ unitPrice: 1_000_000, quantity: 1, status: "IN_PREPARATION" }];
    expect(computeBill(items, excl)).toEqual({
      subtotal: 1_000_000,
      taxAmount: 190_000,
      tipAmount: 100_000,
      total: 1_290_000,
    });
  });

  it("impuesto incluido: el IVA se desglosa y no se suma", () => {
    const items: BillLine[] = [{ unitPrice: 1_190_000, quantity: 1, status: "SERVED" }];
    expect(computeBill(items, incl)).toEqual({
      subtotal: 1_190_000,
      taxAmount: 190_000,
      tipAmount: 119_000,
      total: 1_309_000,
    });
  });

  it("redondea a centavos enteros (incluido)", () => {
    // 1000 / 1.19 = 840.336… → 840 neto → 160 de IVA; propina 100
    const r = computeBill([{ unitPrice: 1000, quantity: 1, status: "SERVED" }], incl);
    expect(r).toEqual({ subtotal: 1000, taxAmount: 160, tipAmount: 100, total: 1100 });
  });

  it("redondea a centavos enteros (no incluido)", () => {
    // 1234 × 0.19 = 234.46 → 234; 1234 × 0.10 = 123.4 → 123
    const r = computeBill([{ unitPrice: 1234, quantity: 1, status: "PENDING" }], excl);
    expect(r).toEqual({ subtotal: 1234, taxAmount: 234, tipAmount: 123, total: 1591 });
    // 1237 × 0.19 = 235.03 → 235; 1237 × 0.10 = 123.7 → 124
    const r2 = computeBill([{ unitPrice: 1237, quantity: 1, status: "PENDING" }], excl);
    expect(r2).toEqual({ subtotal: 1237, taxAmount: 235, tipAmount: 124, total: 1596 });
  });

  it("todos los montos son enteros", () => {
    const r = computeBill(
      [
        { unitPrice: 1999, quantity: 3, status: "SERVED" },
        { unitPrice: 777, quantity: 7, status: "PENDING" },
      ],
      { taxRate: 0.16, tipRate: 0.15, pricesIncludeTax: true },
    );
    for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true);
  });

  it("propina en cero si tipRate = 0", () => {
    const r = computeBill([{ unitPrice: 5000, quantity: 2, status: "SERVED" }], {
      ...excl,
      tipRate: 0,
    });
    expect(r.tipAmount).toBe(0);
    expect(r.total).toBe(10_000 + 1900);
  });
});

describe("parseBillingSettings", () => {
  it("lee los settings del seed", () => {
    expect(
      parseBillingSettings([
        { key: "taxRate", value: "0.19" },
        { key: "pricesIncludeTax", value: "true" },
        { key: "tipRate", value: "0.10" },
        { key: "currency", value: "COP" },
        { key: "restaurantName", value: "Mesa Viva" },
      ]),
    ).toEqual({ taxRate: 0.19, pricesIncludeTax: true, tipRate: 0.1, currency: "COP" });
  });

  it("sin filas → valores por defecto", () => {
    expect(parseBillingSettings([])).toEqual(DEFAULT_BILLING_SETTINGS);
  });

  it("valores inválidos → valores por defecto", () => {
    expect(
      parseBillingSettings([
        { key: "taxRate", value: "abc" },
        { key: "tipRate", value: "-1" },
        { key: "pricesIncludeTax", value: "quizás" },
        { key: "currency", value: "pesos" },
      ]),
    ).toEqual(DEFAULT_BILLING_SETTINGS);
  });

  it("pricesIncludeTax false y moneda en minúsculas", () => {
    const s = parseBillingSettings([
      { key: "pricesIncludeTax", value: "false" },
      { key: "currency", value: "mxn" },
    ]);
    expect(s.pricesIncludeTax).toBe(false);
    expect(s.currency).toBe("MXN");
  });
});
