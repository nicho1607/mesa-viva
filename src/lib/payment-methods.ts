import { z } from "zod";
import { ConflictError } from "@/lib/domain/errors";

export const PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER", "MIXED"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const amount = z.number({ error: "Escribe un importe en centavos enteros" })
  .int({ error: "El importe debe tener centavos enteros" })
  .min(0, { error: "El importe no puede ser negativo" })
  .max(2_147_483_647, { error: "El importe supera el máximo permitido" });
export const closePaymentInput = z.object({
  closeOperationId: z.uuid({ error: "La operación de cierre no es válida" }),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: "Elige un método de pago" }),
  tipRate: z.number({ error: "Propina: escribe un porcentaje válido" })
    .min(0, { error: "Propina: el porcentaje no puede ser negativo" })
    .max(1, { error: "Propina: el porcentaje no puede superar 100 %" })
    .transform((n) => Math.round(n * 10_000) / 10_000).optional(),
  mixedPayment: z.object({
    cashAmount: amount,
    transferAmount: amount,
    tipCashAmount: amount,
    tipTransferAmount: amount,
  }).strict().optional(),
  cashReceivedAmount: amount.optional(),
}).strict();
export type ClosePayment = z.input<typeof closePaymentInput>;

/** Distribución aplicada, nunca efectivo entregado antes del cambio. */
export function reconcilePayment(input: ClosePayment, total: number, tipAmount: number) {
  if (![total, tipAmount].every((n) => Number.isInteger(n) && n >= 0 && n <= 2_147_483_647) || tipAmount > total) {
    throw new ConflictError("El total o la propina supera el importe permitido.");
  }
  const { paymentMethod, mixedPayment, cashReceivedAmount } = closePaymentInput.parse(input);
  if (paymentMethod !== "MIXED" && mixedPayment !== undefined) {
    throw new ConflictError("La distribución solo corresponde al pago mixto.");
  }
  if (paymentMethod === "CARD") {
    if (cashReceivedAmount !== undefined) throw new ConflictError("El efectivo recibido no corresponde a tarjeta.");
    return { cashAmount: null, transferAmount: null, tipCashAmount: null, tipTransferAmount: null, cashReceivedAmount: null };
  }
  const split = paymentMethod === "MIXED" ? mixedPayment : {
    cashAmount: paymentMethod === "CASH" ? total : 0,
    transferAmount: paymentMethod === "TRANSFER" ? total : 0,
    tipCashAmount: paymentMethod === "CASH" ? tipAmount : 0,
    tipTransferAmount: paymentMethod === "TRANSFER" ? tipAmount : 0,
  };
  if (!split || split.cashAmount + split.transferAmount !== total) {
    throw new ConflictError("La transferencia y el efectivo deben sumar el total de la cuenta.");
  }
  if (split.tipCashAmount + split.tipTransferAmount !== tipAmount
    || split.tipCashAmount > split.cashAmount || split.tipTransferAmount > split.transferAmount) {
    throw new ConflictError("La propina por medio debe sumar la propina acordada y no superar el pago de ese medio.");
  }
  const hasCash = paymentMethod === "CASH" || split.cashAmount > 0;
  if (hasCash && (cashReceivedAmount === undefined || cashReceivedAmount < split.cashAmount)) {
    throw new ConflictError("Efectivo recibido: debe cubrir el efectivo aplicado a la cuenta.");
  }
  if (!hasCash && cashReceivedAmount !== undefined) {
    throw new ConflictError("Efectivo recibido: no aplica a un pago sin efectivo.");
  }
  return { ...split, cashReceivedAmount: cashReceivedAmount ?? null };
}

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
