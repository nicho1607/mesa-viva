"use client";

// "Finalizar servicio": resumen con propina editable (0 % / 10 % / otro %), advertencia si
// quedan productos sin servir, y cierre que genera la cuenta (el servidor recalcula todo).

import { useId, useRef, useState } from "react";
import { closeServiceAction } from "@/app/actions/table.actions";
import { Sheet } from "@/components/customer/Sheet";
import { computeBill } from "@/lib/domain/billing";
import type { StaffRoundView, TableDetailView } from "@/lib/domain/staff-table";
import { formatMoney } from "@/lib/money";
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS, parsePaymentAmount, type ClosePayment, type PaymentMethod } from "@/lib/payment-methods";
import { parseTipPercent, percentLabel } from "@/lib/table-view";

type Props = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  rounds: StaffRoundView[];
  settings: TableDetailView["settings"];
  pendingPaymentMethod: PaymentMethod | null;
  unserved: number;
  onClosed: () => void;
};

const PRESETS = [0, 0.1];

export function CloseServiceSheet(props: Props) {
  const [startedOrder, setStartedOrder] = useState<string | null>(null);
  if (props.open && startedOrder !== props.orderId) setStartedOrder(props.orderId);
  return (
    <Sheet open={props.open} onClose={props.onClose} title="Finalizar servicio" subtitle="Revisa la cuenta antes de cerrarla.">
      {startedOrder === props.orderId ? <CloseForm key={props.orderId} {...props} /> : null}
    </Sheet>
  );
}

function CloseForm({ orderId, rounds, settings, pendingPaymentMethod, unserved, onClosed }: Props) {
  const customId = useId();
  const defaultIsPreset = PRESETS.includes(settings.tipRate);
  const [mode, setMode] = useState<number | "custom">(defaultIsPreset ? settings.tipRate : "custom");
  const [custom, setCustom] = useState(defaultIsPreset ? "" : percentLabel(settings.tipRate));
  const [sending, setSending] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(pendingPaymentMethod ?? "");
  const [transfer, setTransfer] = useState("");
  const [tipCash, setTipCash] = useState("");
  const [received, setReceived] = useState("");
  const attempt = useRef<ClosePayment | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tipRate = mode === "custom" ? parseTipPercent(custom) : mode;
  const totals = computeBill(
    rounds.flatMap((r) => r.items),
    { taxRate: settings.taxRate, tipRate: tipRate ?? 0, pricesIncludeTax: settings.pricesIncludeTax },
  );
  const money = (c: number) => formatMoney(c, settings.currency);
  const taxPct = percentLabel(settings.taxRate);
  const transferAmount = paymentMethod === "TRANSFER" ? totals.total : paymentMethod === "MIXED" ? parsePaymentAmount(transfer) : 0;
  const cashAmount = transferAmount === null ? null : totals.total - transferAmount;
  const tipCashAmount = paymentMethod === "CASH" ? totals.tipAmount : paymentMethod === "MIXED" && totals.tipAmount > 0 ? parsePaymentAmount(tipCash) : 0;
  const tipTransferAmount = tipCashAmount === null ? null : totals.tipAmount - tipCashAmount;
  const cashReceivedAmount = parsePaymentAmount(received);
  const hasCash = paymentMethod === "CASH" || (paymentMethod === "MIXED" && cashAmount !== null && cashAmount > 0);
  const payment: Omit<ClosePayment, "closeOperationId"> = {
    paymentMethod: paymentMethod || "CASH", tipRate: tipRate ?? 0,
    ...(paymentMethod === "MIXED" ? { mixedPayment: {
      transferAmount: transferAmount ?? -1, cashAmount: cashAmount ?? -1,
      tipCashAmount: tipCashAmount ?? -1, tipTransferAmount: tipTransferAmount ?? -1,
    } } : {}),
    ...(hasCash ? { cashReceivedAmount: cashReceivedAmount ?? -1 } : {}),
  };
  const transferError = paymentMethod === "MIXED" && (transferAmount === null || transferAmount > totals.total)
    ? "Transferencia: escribe un importe entre cero y el total de la cuenta." : null;
  const tipCashError = paymentMethod === "MIXED" && (tipCashAmount === null || tipTransferAmount === null
    || tipTransferAmount < 0 || (cashAmount !== null && tipCashAmount > cashAmount)
    || (transferAmount !== null && tipTransferAmount > transferAmount))
    ? "Propina en efectivo: debe conciliar con la propina acordada y con lo pagado por cada medio." : null;
  const receivedError = hasCash && (cashReceivedAmount === null || cashAmount === null || cashReceivedAmount < cashAmount)
    ? "Efectivo recibido: escribe un importe que cubra el efectivo aplicado a la cuenta." : null;
  const paymentError = transferError ?? tipCashError ?? receivedError;

  async function submit() {
    if (sending || (!uncertain && (tipRate === null || !paymentMethod || paymentError))) return;
    if (!attempt.current) attempt.current = { ...payment, closeOperationId: crypto.randomUUID() };
    setSending(true);
    setError(null);
    try {
      const r = await closeServiceAction(orderId, attempt.current);
      if (!r.ok) {
        if (r.code === "INTERNAL") {
          setUncertain(true);
          setError("No pudimos confirmar el resultado. Reintenta para recuperar el mismo pago.");
        } else {
          attempt.current = null;
          setUncertain(false);
          setError(r.error);
        }
        return;
      }
      attempt.current = null;
      setUncertain(false);
      onClosed();
    } catch {
      setUncertain(true);
      setError("Se perdió la conexión. Reintenta para recuperar el mismo pago, sin volver a cobrar.");
    } finally { setSending(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset disabled={sending || uncertain} className="contents">
        {unserved > 0 ? (
          <p role="alert" className="rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2 font-bold">
            {unserved === 1 ? "Hay 1 producto sin servir." : `Hay ${unserved} productos sin servir.`}{" "}
            <span className="font-normal">Se cobrarán igual; cancélalos antes si no se van a servir.</span>
          </p>
        ) : null}

        <label className="grid gap-1 font-bold">
          Método de pago usado
          <select
            required
            value={paymentMethod}
            disabled={sending}
            onChange={(e) => setPaymentMethod(PAYMENT_METHODS.find((method) => method === e.target.value) ?? "")}
            className="min-h-11 rounded-lg border border-tinta/30 bg-white px-3"
          >
            <option value="">Elige un método</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>{PAYMENT_METHOD_LABEL[method]}</option>
            ))}
          </select>
        </label>

        {paymentMethod === "MIXED" ? (
          <fieldset className="grid gap-3" disabled={sending}>
            <legend className="mb-2 font-bold">Distribución del pago mixto</legend>
            <p id={`${customId}-split-help`} className="text-tinta-suave">
              Escribe la transferencia total y la propina en efectivo en pesos, sin separador de miles. El resto se calcula automáticamente.
            </p>
            <label className="grid gap-1 font-bold">
              Transferencia
              <input
                inputMode="decimal"
                value={transfer}
                onChange={(e) => setTransfer(e.target.value)}
                aria-invalid={!!transferError}
                aria-describedby={`${customId}-split-help ${customId}-payment-status`}
                className="min-h-12 rounded-lg border border-tinta/30 bg-plato px-3 text-base tabular-nums"
              />
            </label>
            <p>Efectivo aplicado: <strong>{cashAmount !== null && cashAmount >= 0 ? money(cashAmount) : "—"}</strong></p>
            {totals.tipAmount > 0 ? (
              <label className="grid gap-1 font-bold">
                Propina en efectivo
                <input inputMode="decimal" value={tipCash} onChange={(e) => setTipCash(e.target.value)}
                  aria-invalid={!!tipCashError}
                  aria-describedby={`${customId}-payment-status`}
                  className="min-h-12 rounded-lg border border-tinta/30 bg-plato px-3 text-base tabular-nums" />
              </label>
            ) : null}
            <p>Propina por transferencia: <strong>{tipTransferAmount !== null && tipTransferAmount >= 0 ? money(tipTransferAmount) : "—"}</strong></p>
          </fieldset>
        ) : null}

        <fieldset>
          <legend className="font-bold">Propina</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={mode === p}
                onClick={() => setMode(p)}
                className={`min-h-12 min-w-20 rounded-lg border-2 px-4 text-lg font-bold tabular-nums ${
                  mode === p ? "border-tinta bg-tinta text-plato" : "border-tinta/25 text-tinta hover:border-tinta"
                }`}
              >
                {percentLabel(p)} %
              </button>
            ))}
            <button
              type="button"
              aria-pressed={mode === "custom"}
              onClick={() => setMode("custom")}
              className={`min-h-12 rounded-lg border-2 px-4 text-lg font-bold ${
                mode === "custom" ? "border-tinta bg-tinta text-plato" : "border-tinta/25 text-tinta hover:border-tinta"
              }`}
            >
              Otro
            </button>
          </div>
          {mode === "custom" ? (
            <div className="mt-3">
              <label htmlFor={customId} className="block text-tinta-suave">
                Porcentaje de propina
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id={customId}
                  inputMode="decimal"
                  value={custom}
                  autoFocus
                  onChange={(e) => setCustom(e.target.value)}
                  aria-invalid={tipRate === null}
                  aria-describedby={tipRate === null ? `${customId}-err` : undefined}
                  className="min-h-12 w-28 rounded-lg border border-tinta/30 bg-plato px-3 text-lg tabular-nums focus:border-tinta focus-visible:outline-azafran"
                />
                <span className="text-lg">%</span>
              </div>
              {tipRate === null ? (
                <p id={`${customId}-err`} className="mt-1 text-guindilla">
                  Escribe un porcentaje entre 0 y 100.
                </p>
              ) : null}
            </div>
          ) : null}
        </fieldset>

        {hasCash ? (
          <label className="grid gap-1 font-bold">
            Efectivo recibido
            <input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)}
              aria-invalid={!!receivedError}
              aria-describedby={`${customId}-payment-status`}
              className="min-h-12 rounded-lg border border-tinta/30 bg-plato px-3 text-base tabular-nums" />
          </label>
        ) : null}
        <p id={`${customId}-payment-status`} role="status" className={paymentError ? "text-guindilla" : "text-albahaca"}>
          {paymentError ?? (paymentMethod ? "Los importes coinciden con el total." : "Elige un método de pago.")}
        </p>
        <dl className="border-t-2 border-dashed border-tinta/30 pt-3 text-lg tabular-nums">
          <Row label="Cuenta sin propina" value={money(totals.total - totals.tipAmount)} />
          <Row label="Subtotal" value={money(totals.subtotal)} />
          {settings.pricesIncludeTax ? (
            <Row label={`IVA incluido (${taxPct} %)`} value={money(totals.taxAmount)} muted />
          ) : (
            <Row label={`IVA (${taxPct} %)`} value={money(totals.taxAmount)} />
          )}
          <Row label={`Propina (${tipRate === null ? "—" : percentLabel(tipRate)} %)`} value={money(totals.tipAmount)} />
          <div className="mt-2 flex items-baseline justify-between gap-4 border-t-4 border-double border-tinta pt-2">
            <dt className="font-display text-2xl font-semibold [font-stretch:87.5%]">Total</dt>
            <dd className="font-display text-4xl leading-none font-semibold tracking-tight">{money(totals.total)}</dd>
          </div>
        </dl>
        {hasCash && cashReceivedAmount !== null && cashAmount !== null && cashReceivedAmount >= cashAmount ? <p>Cambio: {money(cashReceivedAmount - cashAmount)}</p> : null}
        <p className="text-tinta-suave">Confirma que recibiste el dinero. La transferencia se comprueba manualmente.</p>
      </fieldset>

      {error ? (
        <p role="alert" className="rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={sending || (!uncertain && (tipRate === null || !paymentMethod || !!paymentError))}
        onClick={() => void submit()}
        className="flex min-h-13 w-full items-center justify-center rounded-xl bg-tinta px-5 text-lg font-bold text-plato hover:bg-tinta/90 disabled:bg-tinta/40"
      >
        {sending ? "Registrando pago…" : uncertain ? "Reintentar el mismo pago" : "Registrar pago y finalizar"}
      </button>
    </div>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 py-0.5 ${muted ? "text-tinta-suave" : ""}`}>
      <dt>{label}</dt>
      <span aria-hidden="true" className="mb-1 min-w-4 flex-1 self-end border-b-2 border-dotted border-tinta/20" />
      <dd className="whitespace-nowrap">{value}</dd>
    </div>
  );
}
