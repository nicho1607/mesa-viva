"use client";

// "Llamar al mesero" / "Pedir la cuenta". callWaiter no publica al canal de la mesa,
// así que la confirmación sale del resultado de la acción. Tras avisar, ambos botones
// quedan deshabilitados unos segundos para evitar llamadas repetidas.

import { useEffect, useRef, useState } from "react";
import { callWaiter } from "@/app/actions/order.actions";

type Reason = "assistance" | "bill";
type CallState =
  | { kind: "idle" }
  | { kind: "sending"; reason: Reason }
  | { kind: "sent"; reason: Reason }
  | { kind: "error"; message: string };

const COOLDOWN_MS = 8_000;

const SENT_TEXT: Record<Reason, string> = {
  assistance: "Avisamos a tu mesero. Viene en un momento.",
  bill: "Avisamos a tu mesero. Te trae la cuenta en un momento.",
};

export function CallWaiterButtons({ token, withBill }: { token: string; withBill: boolean }) {
  const [state, setState] = useState<CallState>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const busy = state.kind === "sending" || state.kind === "sent";

  async function call(reason: Reason) {
    if (busy) return;
    setState({ kind: "sending", reason });
    const r = await callWaiter(token, reason);
    if (r.ok) {
      setState({ kind: "sent", reason });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState({ kind: "idle" }), COOLDOWN_MS);
    } else {
      setState({
        kind: "error",
        message:
          r.code === "RATE_LIMITED"
            ? "Ya avisamos a tu mesero hace un momento. Espera un minuto antes de volver a llamar."
            : r.error,
      });
    }
  }

  const label = (reason: Reason, text: string) =>
    state.kind === "sending" && state.reason === reason ? "Avisando…" : text;

  return (
    <div>
      <div className={`grid gap-3 ${withBill ? "sm:grid-cols-2" : ""}`}>
        <button
          type="button"
          onClick={() => void call("assistance")}
          disabled={busy}
          className="flex min-h-13 items-center justify-center rounded-xl border-2 border-tinta px-5 text-lg font-bold text-tinta hover:bg-tinta/[0.04] disabled:border-tinta/35 disabled:text-tinta-suave"
        >
          {label("assistance", "Llamar al mesero")}
        </button>
        {withBill ? (
          <button
            type="button"
            onClick={() => void call("bill")}
            disabled={busy}
            className="flex min-h-13 items-center justify-center rounded-xl bg-tinta px-5 text-lg font-bold text-plato hover:bg-[#25365c] disabled:bg-tinta/45"
          >
            {label("bill", "Pedir la cuenta")}
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
            {SENT_TEXT[state.reason]}
          </p>
        ) : state.kind === "error" ? (
          <p className="rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2 text-tinta">{state.message}</p>
        ) : null}
      </div>
    </div>
  );
}
