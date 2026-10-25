"use client";

// Una ronda como comanda de cocina: hora, platos con cantidad y la nota resaltada (lo que
// no se puede pasar por alto), estado por plato y la acción principal de la ronda.

import { useState } from "react";
import type { StaffItemView, StaffRoundView } from "@/lib/domain/staff-table";
import { ITEM_STATUS_LABEL, formatClock, itemActions, roundActions } from "@/lib/table-view";

type Props = {
  round: StaffRoundView;
  money: (cents: number) => string;
  canManage: boolean;
  /** Clave de la operación en curso (`round-n` o id de ítem). */
  busy: string | null;
  onConfirm: () => Promise<boolean>;
  onServeRound: () => Promise<boolean>;
  onServeItem: (itemId: string) => Promise<boolean>;
  onCancelItem: (itemId: string) => Promise<boolean>;
};

export function RoundTicket({ round, money, canManage, busy, onConfirm, onServeRound, onServeItem, onCancelItem }: Props) {
  const a = roundActions(round.items);
  const roundBusy = busy === `round-${round.round}`;
  const headingId = `ronda-${round.round}`;
  const state = a.canConfirm ? "pending" : a.canServe ? "kitchen" : "done";

  return (
    <section
      aria-labelledby={headingId}
      className={`overflow-hidden rounded-lg border border-l-[6px] bg-white ${state === "pending" ? "border-azafran" : "border-tinta/15 border-l-tinta/15"}`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-dashed border-tinta/25 px-4 py-3">
        <h2 id={headingId} className="font-display text-xl font-semibold [font-stretch:87.5%]">
          Ronda {round.round}
        </h2>
        <span className="text-tinta-suave tabular-nums">
          <span className="sr-only">enviada a las </span>
          {formatClock(round.createdAt)}
        </span>
        <span className="text-[15px] font-bold">
          {state === "pending" ? "Sin confirmar" : state === "kitchen" ? "En cocina" : null}
        </span>
        {canManage && (a.canConfirm || a.canServe) ? (
          <button
            type="button"
            disabled={roundBusy}
            onClick={() => void (a.canConfirm ? onConfirm() : onServeRound())}
            className={`ml-auto min-h-12 rounded-lg px-5 text-lg font-bold disabled:opacity-60 ${
              a.canConfirm ? "bg-tinta text-plato hover:bg-tinta/90" : "bg-albahaca text-white hover:bg-albahaca/90"
            }`}
          >
            {roundBusy ? "Guardando…" : a.canConfirm ? "Confirmar ronda" : "Ronda servida"}
          </button>
        ) : null}
      </header>
      <ul className="divide-y divide-tinta/10">
        {round.items.map((i) => (
          <ItemRow
            key={i.id}
            item={i}
            money={money}
            canManage={canManage}
            busy={busy === i.id}
            onServe={() => onServeItem(i.id)}
            onCancel={() => onCancelItem(i.id)}
          />
        ))}
      </ul>
    </section>
  );
}

const MARK: Record<string, string> = {
  PENDING: "border-2 border-tinta-suave",
  IN_PREPARATION: "bg-azafran",
  SERVED: "bg-albahaca",
  CANCELLED: "bg-guindilla",
};

function ItemRow({
  item: i,
  money,
  canManage,
  busy,
  onServe,
  onCancel,
}: {
  item: StaffItemView;
  money: (c: number) => string;
  canManage: boolean;
  busy: boolean;
  onServe: () => Promise<boolean>;
  onCancel: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const cancelled = i.status === "CANCELLED";
  const act = itemActions(i.status);

  return (
    <li className="px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className={`w-9 shrink-0 text-lg tabular-nums ${cancelled ? "text-tinta-suave line-through" : "font-bold"}`}>
          {i.quantity}×
        </span>
        <span
          className={`min-w-0 font-display text-xl leading-snug font-semibold [font-stretch:87.5%] ${cancelled ? "text-tinta-suave line-through" : ""}`}
        >
          {i.productName}
        </span>
        <span aria-hidden="true" className="mb-1 min-w-4 flex-1 self-end border-b-2 border-dotted border-tinta/20" />
        <span className={`whitespace-nowrap tabular-nums ${cancelled ? "text-tinta-suave line-through" : ""}`}>
          {money(i.unitPrice * i.quantity)}
        </span>
      </div>

      {i.notes ? (
        <p
          className={`mt-2 ml-11 rounded-r-md border-l-4 px-3 py-1.5 text-lg leading-snug font-bold ${
            cancelled ? "border-tinta/20 bg-transparent text-tinta-suave line-through" : "border-azafran bg-azafran/15 text-tinta"
          }`}
        >
          <span className="sr-only">Nota: </span>
          {i.notes}
        </p>
      ) : null}

      <div className="mt-2 ml-11 flex flex-wrap items-center gap-2">
        <span className={`mr-auto flex items-center gap-1.5 text-[15px] ${cancelled ? "font-bold text-guindilla" : "text-tinta-suave"}`}>
          <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${MARK[i.status]}`} />
          {ITEM_STATUS_LABEL[i.status]}
        </span>
        {canManage && confirming ? (
          <span role="group" aria-label={`Confirmar cancelación de ${i.productName}`} className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-guindilla">¿Cancelar este plato?</span>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await onCancel()) setConfirming(false);
              }}
              className="min-h-11 rounded-md bg-guindilla px-4 font-bold text-white hover:bg-guindilla/90 disabled:opacity-60"
            >
              {busy ? "Cancelando…" : "Sí, cancelar"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="min-h-11 rounded-md border border-tinta/40 px-4 font-bold text-tinta hover:border-tinta"
            >
              No
            </button>
          </span>
        ) : canManage ? (
          <>
            {act.canServe ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onServe()}
                className="min-h-11 rounded-md border-2 border-albahaca px-4 font-bold text-albahaca hover:bg-albahaca hover:text-white disabled:opacity-60"
              >
                {busy ? "Guardando…" : "Servido"}
              </button>
            ) : null}
            {act.canCancel ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(true)}
                className="min-h-11 rounded-md px-3 font-bold text-guindilla hover:bg-guindilla/8"
              >
                Cancelar
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}
