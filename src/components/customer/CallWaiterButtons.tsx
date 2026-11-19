"use client";

// "Llamar al mesero" / "Pedir la cuenta". callWaiter no publica al canal de la mesa,
// así que la confirmación sale del resultado de la acción. Tras avisar, ambos botones
// quedan deshabilitados unos segundos para evitar llamadas repetidas.

import { useEffect, useRef, useState } from "react";
import { callWaiter } from "@/app/actions/order.actions";
import { Sheet } from "@/components/customer/Sheet";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payment-methods";

import { useLanguage } from "./LanguageProvider";
import { customerError } from "@/lib/i18n";
import type { ActionError } from "@/lib/action-result";

type Reason = "assistance" | "bill";
type CallState =
  | { kind: "idle" }
  | { kind: "sending"; reason: Reason }
  | { kind: "sent"; reason: Reason }
  | { kind: "error"; code: string; details?: ActionError["details"]; paymentMethod?: PaymentMethod };

const COOLDOWN_MS = 8_000;

const PAYMENT_KEYS = { CASH: "cash", CARD: "card", TRANSFER: "transfer", MIXED: "mixed" } as const;

export function CallWaiterButtons({ token, withBill }: { token: string; withBill: boolean }) {
  const { t, locale } = useLanguage();
  const [state, setState] = useState<CallState>({ kind: "idle" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const sending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const busy = state.kind === "sending" || state.kind === "sent";

  async function call(reason: Reason, paymentMethod?: PaymentMethod) {
    if (busy || sending.current) return;
    sending.current = true;
    setState({ kind: "sending", reason });
    try {
      const r = await callWaiter(token, reason, paymentMethod);
      if (r.ok) {
        setPickerOpen(false);
        setState({ kind: "sent", reason });
        timer.current = setTimeout(() => setState({ kind: "idle" }), COOLDOWN_MS);
        return;
      }
      setState({
        kind: "error",
        paymentMethod,
        code: r.code === "RATE_LIMITED" ? "CALL_RATE_LIMITED" : r.code,
        details: r.details,
      });
    } catch {
      setState({ kind: "error", paymentMethod, code: "CALL_FAILED" });
    } finally {
      sending.current = false;
    }
  }

  function closePicker() {
    if (sending.current || state.kind === "sending") return;
    setPickerOpen(false);
  }

  const failedMethod = state.kind === "error" ? state.paymentMethod : undefined;
  const label = (reason: Reason, text: string) =>
    state.kind === "sending" && state.reason === reason ? t("notifying") : text;

  return (
    <div>
      <div className={`grid gap-3 ${withBill ? "sm:grid-cols-2" : ""}`}>
        <button
          type="button"
          onClick={() => void call("assistance")}
          disabled={busy}
          className="flex min-h-13 items-center justify-center rounded-xl border-2 border-tinta px-5 text-lg font-bold text-tinta hover:bg-tinta/[0.04] disabled:border-tinta/35 disabled:text-tinta-suave"
        >
          {label("assistance", t("callWaiter"))}
        </button>
        {withBill ? (
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              setPickerOpen(true);
            }}
            aria-haspopup="dialog"
            aria-disabled={busy}
            className="flex min-h-13 items-center justify-center rounded-xl bg-tinta px-5 text-lg font-bold text-plato hover:bg-[#25365c] aria-disabled:bg-tinta/45"
          >
            {t("requestBill")}
          </button>
        ) : null}
      </div>
      <div role="status" aria-live="polite" className="mt-3 min-h-6">
        {state.kind === "sent" ? (
          <p className="flex items-center gap-2 font-bold text-albahaca">
            <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-albahaca text-white">
              <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {t(state.reason === "assistance" ? "assistanceSent" : "billSent")}
          </p>
        ) : state.kind === "error" && !pickerOpen ? (
          <p className="rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2 text-tinta">{customerError(locale, state)}</p>
        ) : null}
      </div>
      {withBill ? (
        <Sheet open={pickerOpen} onClose={closePicker} title={t("payment")}>
          <div className="grid gap-2">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method}
                type="button"
                disabled={busy}
                onClick={() => void call("bill", method)}
                className="min-h-11 rounded-xl border-2 border-tinta px-4 font-bold text-tinta hover:bg-tinta/[0.04] disabled:opacity-50"
              >
                {t(PAYMENT_KEYS[method])}
              </button>
            ))}
          </div>
          <div role="status" className="mt-3">
            {state.kind === "sending" ? <p>{t("notifying")}</p> : null}
            {state.kind === "error" && failedMethod ? (
              <p className="rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2 text-tinta">
                {customerError(locale, state)}
              </p>
            ) : null}
          </div>
          {failedMethod ? (
            <button
              type="button"
              onClick={() => void call("bill", failedMethod)}
              className="mt-2 min-h-11 rounded-xl bg-tinta px-4 font-bold text-plato"
            >
              {t("retryPayment", { method: t(PAYMENT_KEYS[failedMethod]) })}
            </button>
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}
