export const PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER", "MIXED"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type MixedPayment = { transferAmount: number; cashAmount: number };

/** Pesos sin separador de miles, con hasta dos decimales después de coma o punto. */
export function parsePaymentAmount(value: string): number | null {
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 2_147_483_647 ? cents : null;
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  MIXED: "Pago mixto",
};
