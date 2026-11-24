import { describe, expect, it } from "vitest";
import { closePaymentInput, reconcilePayment, type ClosePayment } from "@/lib/payment-methods";
import { toActionError } from "@/lib/action-result";

const base = { closeOperationId: "00000000-0000-4000-8000-000000000000", tipRate: 0.1 };
const mixed = { cashAmount: 1_000_000, transferAmount: 10_000_000, tipCashAmount: 1_000_000, tipTransferAmount: 0 };

describe("conciliación del pago y propina", () => {
  it.each([
    [{ paymentMethod: "CASH", cashReceivedAmount: 12_000_000 }, 11_000_000, 1_000_000, 11_000_000, 0, 1_000_000, 0],
    [{ paymentMethod: "TRANSFER" }, 11_000_000, 1_000_000, 0, 11_000_000, 0, 1_000_000],
    [{ paymentMethod: "TRANSFER" }, 10_000_000, 0, 0, 10_000_000, 0, 0],
    [{ paymentMethod: "MIXED", mixedPayment: mixed, cashReceivedAmount: 2_000_000 }, 11_000_000, 1_000_000, 1_000_000, 10_000_000, 1_000_000, 0],
    [{ paymentMethod: "MIXED", mixedPayment: { cashAmount: 600_000, transferAmount: 10_400_000, tipCashAmount: 600_000, tipTransferAmount: 400_000 }, cashReceivedAmount: 600_000 }, 11_000_000, 1_000_000, 600_000, 10_400_000, 600_000, 400_000],
  ] as const)("concilia %j", (input, total, tip, cash, transfer, tipCash, tipTransfer) => {
    const result = reconcilePayment({ ...base, ...input }, total, tip);
    expect(result).toMatchObject({ cashAmount: cash, transferAmount: transfer, tipCashAmount: tipCash, tipTransferAmount: tipTransfer });
    if (result.cashReceivedAmount !== null) expect(result.cashReceivedAmount - result.cashAmount!).toBeGreaterThanOrEqual(0);
  });

  it.each([
    { paymentMethod: "CASH" },
    { paymentMethod: "CASH", cashReceivedAmount: 10_000_000 },
    { paymentMethod: "TRANSFER", cashReceivedAmount: 0 },
    { paymentMethod: "CARD", cashReceivedAmount: 1 },
    { paymentMethod: "TRANSFER", mixedPayment: mixed },
    { paymentMethod: "MIXED", mixedPayment: { ...mixed, cashAmount: 500_000, transferAmount: 10_500_000 }, cashReceivedAmount: 1_000_000 },
    { paymentMethod: "MIXED", mixedPayment: { ...mixed, tipTransferAmount: 1 }, cashReceivedAmount: 1_000_000 },
    { paymentMethod: "MIXED", mixedPayment: { ...mixed, cashAmount: 0 }, cashReceivedAmount: 1_000_000 },
    { paymentMethod: "CASH", cashReceivedAmount: -1 },
    { paymentMethod: "CASH", cashReceivedAmount: 11_000_000.5 },
    { paymentMethod: "CASH", cashReceivedAmount: 2_147_483_648 },
  ] as const)("rechaza %j", (input) => {
    expect(() => reconcilePayment({ ...base, ...input } as ClosePayment, 11_000_000, 1_000_000)).toThrow();
  });

  it("rechaza total desbordado y datos adicionales, conserva tarjeta y redondea el porcentaje", () => {
    expect(() => reconcilePayment({ ...base, paymentMethod: "TRANSFER" }, 2_147_483_648, 0)).toThrow();
    expect(() => closePaymentInput.parse({ ...base, paymentMethod: "TRANSFER", total: 1 })).toThrow();
    expect(reconcilePayment({ ...base, paymentMethod: "CARD" }, 11_000_000, 1_000_000)).toEqual({
      cashAmount: null, transferAmount: null, tipCashAmount: null, tipTransferAmount: null, cashReceivedAmount: null,
    });
    expect(closePaymentInput.parse({ ...base, paymentMethod: "TRANSFER", tipRate: 0.123456 }).tipRate).toBe(0.1235);
  });

  it("identifica el campo inválido en la respuesta de la acción", () => {
    const parsed = closePaymentInput.safeParse({ ...base, paymentMethod: "CASH", cashReceivedAmount: -1 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(toActionError(parsed.error)).toMatchObject({ code: "VALIDATION", error: expect.stringContaining("efectivo recibido") });
  });
});
