"use client";

// "Finalizar servicio": resumen con propina editable (0 % / 10 % / otro %), advertencia si
// quedan productos sin servir, y cierre que genera la cuenta (el servidor recalcula todo).

import { useId, useState } from "react";
import { closeServiceAction } from "@/app/actions/table.actions";
import { Sheet } from "@/components/customer/Sheet";
import { computeBill } from "@/lib/domain/billing";
import type { StaffRoundView, TableDetailView } from "@/lib/domain/staff-table";
import { formatMoney } from "@/lib/money";
import { parseTipPercent, percentLabel } from "@/lib/table-view";

type Props = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  rounds: StaffRoundView[];
  settings: TableDetailView["settings"];
  unserved: number;
  onClosed: () => void;
};

const PRESETS = [0, 0.1];

export function CloseServiceSheet(props: Props) {
  return (
    <Sheet open={props.open} onClose={props.onClose} title="Finalizar servicio" subtitle="Revisa la cuenta antes de cerrarla.">
      {/* key: cada apertura empieza con la propina por defecto */}
      {props.open ? <CloseForm key={props.orderId} {...props} /> : null}
    </Sheet>
  );
}

function CloseForm({ orderId, rounds, settings, unserved, onClosed }: Props) {
  const customId = useId();
  const defaultIsPreset = PRESETS.includes(settings.tipRate);
  const [mode, setMode] = useState<number | "custom">(defaultIsPreset ? settings.tipRate : "custom");
  const [custom, setCustom] = useState(defaultIsPreset ? "" : percentLabel(settings.tipRate));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tipRate = mode === "custom" ? parseTipPercent(custom) : mode;
  const totals = computeBill(
    rounds.flatMap((r) => r.items),
    { taxRate: settings.taxRate, tipRate: tipRate ?? 0, pricesIncludeTax: settings.pricesIncludeTax },
  );
  const money = (c: number) => formatMoney(c, settings.currency);
  const taxPct = percentLabel(settings.taxRate);

  async function submit() {
    if (tipRate === null) return;
    setSending(true);
    setError(null);
    const r = await closeServiceAction(orderId, tipRate);
    setSending(false);
    if (!r.ok) return setError(r.error);
    onClosed();
  }

  return (
    <div className="flex flex-col gap-5">
      {unserved > 0 ? (
        <p role="alert" className="rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2 font-bold">
          {unserved === 1 ? "Hay 1 producto sin servir." : `Hay ${unserved} productos sin servir.`}{" "}
          <span className="font-normal">Se cobrarán igual; cancélalos antes si no se van a servir.</span>
        </p>
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

      <dl className="border-t-2 border-dashed border-tinta/30 pt-3 text-lg tabular-nums">
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

      {error ? (
        <p role="alert" className="rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={sending || tipRate === null}
        onClick={() => void submit()}
        className="flex min-h-13 w-full items-center justify-center rounded-xl bg-tinta px-5 text-lg font-bold text-plato hover:bg-tinta/90 disabled:bg-tinta/40"
      >
        {sending ? "Generando la cuenta…" : "Finalizar y generar cuenta"}
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
