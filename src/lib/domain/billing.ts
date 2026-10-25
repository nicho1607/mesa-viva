// Cálculo de la cuenta: función pura, usada en la cuenta en vivo y al cerrar.
// Todo el dinero va en centavos enteros.

export type BillLine = {
  unitPrice: number; // centavos
  quantity: number;
  status: string; // ItemStatus; los CANCELLED no cuentan
};

export type BillOptions = {
  taxRate: number; // p.ej. 0.19
  tipRate: number; // p.ej. 0.10 (propina sugerida, sobre el subtotal)
  pricesIncludeTax: boolean; // si true, el IVA ya está dentro del precio y solo se desglosa
};

export type BillTotals = {
  subtotal: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
};

export function computeBill(items: readonly BillLine[], options: BillOptions): BillTotals {
  const { taxRate, tipRate, pricesIncludeTax } = options;
  const subtotal = items
    .filter((i) => i.status !== "CANCELLED")
    .reduce((sum, i) => sum + Math.round(i.unitPrice) * i.quantity, 0);

  const taxAmount = pricesIncludeTax
    ? subtotal - Math.round(subtotal / (1 + taxRate))
    : Math.round(subtotal * taxRate);
  const tipAmount = Math.round(subtotal * tipRate);
  const total = pricesIncludeTax ? subtotal + tipAmount : subtotal + taxAmount + tipAmount;

  return { subtotal, taxAmount, tipAmount, total };
}

export type BillingSettings = BillOptions & { currency: string };

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  taxRate: 0.19,
  tipRate: 0.1,
  pricesIncludeTax: true,
  currency: "COP",
};

function parseRate(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return fallback;
}

/** Convierte las filas `Setting` (strings) en opciones de cobro, con valores por defecto seguros. */
export function parseBillingSettings(
  rows: readonly { key: string; value: string }[],
): BillingSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const d = DEFAULT_BILLING_SETTINGS;
  const currency = map.get("currency")?.trim().toUpperCase();
  return {
    taxRate: parseRate(map.get("taxRate"), d.taxRate),
    tipRate: parseRate(map.get("tipRate"), d.tipRate),
    pricesIncludeTax: parseBool(map.get("pricesIncludeTax"), d.pricesIncludeTax),
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : d.currency,
  };
}
