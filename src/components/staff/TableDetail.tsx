"use client";

// Detalle de mesa en vivo. "Señal + refetch": el SSE del staff (waiter:{id} o staff:floor)
// invalida ["table", id] solo si el evento es de esta mesa (payload.tableId).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { acknowledgeTable } from "@/app/actions/floor.actions";
import {
  cancelItemAction,
  confirmRoundAction,
  getTableDetail,
  serveRoundAction,
  setItemStatusAction,
} from "@/app/actions/table.actions";
import type { ActionResult } from "@/lib/action-result";
import type { TableDetailView } from "@/lib/domain/staff-table";
import { formatMoney } from "@/lib/money";
import type { RealtimeEvent, RealtimePayload } from "@/lib/realtime/events";
import { useRealtimeInvalidate } from "@/lib/realtime/use-channel";
import { newestFirst, unservedCount } from "@/lib/table-view";
import { AddItemsSheet } from "./AddItemsSheet";
import { CloseServiceSheet } from "./CloseServiceSheet";
import { FinalBill } from "./FinalBill";
import { RoundTicket } from "./RoundTicket";

type Props = { tableId: string; initialDetail: TableDetailView };

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Libre",
  OCCUPIED: "Ocupada",
  NEEDS_ATTENTION: "Llamando",
  INACTIVE: "Inactiva",
};

export function TableDetail({ tableId, initialDetail }: Props) {
  const qc = useQueryClient();
  const queryKey = ["table", tableId];
  const { data = initialDetail, error: loadError } = useQuery({
    queryKey,
    queryFn: async () => {
      const r = await getTableDetail(tableId);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    initialData: initialDetail,
    refetchOnWindowFocus: true,
  });

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["table", tableId] });
    void qc.invalidateQueries({ queryKey: ["floor"] });
  }, [qc, tableId]);

  const onEvent = useCallback(
    (_event: RealtimeEvent, payload: RealtimePayload) => {
      if (payload.tableId === tableId) void qc.invalidateQueries({ queryKey: ["table", tableId] });
    },
    [qc, tableId],
  );
  // Sin query keys: solo invalidamos lo que es de esta mesa (onEvent) y al (re)conectar.
  const { connected } = useRealtimeInvalidate("/api/events", [], onEvent);
  useEffect(() => {
    if (connected) void qc.invalidateQueries({ queryKey: ["table", tableId] });
  }, [connected, qc, tableId]);
  const [everConnected, setEverConnected] = useState(false);
  if (connected && !everConnected) setEverConnected(true);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"add" | "close" | null>(null);

  async function run(key: string, fn: () => Promise<ActionResult<unknown>>) {
    setBusy(key);
    setError(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setError(r.error);
    refresh();
    return r.ok;
  }

  const { table, order, totals, closedBill, settings, can } = data;
  const money = (c: number) => formatMoney(c, settings.currency);
  const unserved = order ? unservedCount(order.rounds) : 0;

  return (
    <>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 print:hidden">
        <h1 className="font-display text-4xl leading-none font-semibold tracking-tight [font-stretch:87.5%]">
          Mesa <span className="tabular-nums">{table.number}</span>
          <span className="ml-3 font-sans text-xl font-normal tracking-normal text-tinta-suave">{table.zoneName}</span>
        </h1>
        <p className="flex items-center gap-2 text-[15px]">
          <span className="font-bold">{STATUS_LABEL[table.status] ?? table.status}</span>
          <span className="text-tinta-suave">{table.seats} puestos</span>
          {everConnected && !connected ? (
            <span role="status" className="flex items-center gap-1.5 font-bold text-guindilla">
              <span aria-hidden="true" className="size-2 rounded-full bg-guindilla" />
              Reconectando…
            </span>
          ) : null}
        </p>
      </header>

      {table.attentionReason ? (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-guindilla px-4 py-3 text-white print:hidden"
        >
          <p className="text-lg font-bold">
            {table.attentionReason === "bill" ? "La mesa pide la cuenta." : "La mesa te llama."}
          </p>
          <button
            type="button"
            disabled={busy === "ack"}
            onClick={() => void run("ack", () => acknowledgeTable(table.id))}
            className="min-h-11 rounded-md bg-white px-4 font-bold text-guindilla hover:bg-plato disabled:opacity-60"
          >
            {busy === "ack" ? "Guardando…" : "Atendido"}
          </button>
        </div>
      ) : null}

      {error || loadError ? (
        <p role="alert" className="mt-4 rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2 print:hidden">
          {error ?? "No pudimos actualizar la mesa. Lo reintentamos en un momento."}
        </p>
      ) : null}

      {order ? (
        <div className="mt-6 flex flex-col gap-5">
          {order.rounds.length === 0 ? (
            <p className="text-lg text-tinta-suave">La cuenta está abierta pero aún no tiene productos.</p>
          ) : (
            newestFirst(order.rounds).map((r) => (
              <RoundTicket
                key={r.round}
                round={r}
                money={money}
                canManage={can.manage}
                busy={busy}
                onConfirm={() => run(`round-${r.round}`, () => confirmRoundAction(order.id, r.round))}
                onServeRound={() => run(`round-${r.round}`, () => serveRoundAction(order.id, r.round))}
                onServeItem={(itemId) => run(itemId, () => setItemStatusAction(itemId, "SERVED"))}
                onCancelItem={(itemId) => run(itemId, () => cancelItemAction(itemId))}
              />
            ))
          )}
        </div>
      ) : closedBill ? (
        <FinalBill bill={closedBill} tableNumber={table.number} zoneName={table.zoneName} currency={settings.currency}
          pricesIncludeTax={settings.pricesIncludeTax}
        />
      ) : (
        <div className="mt-10">
          <p className="font-display text-2xl font-semibold [font-stretch:87.5%]">Sin pedido abierto.</p>
          <p className="mt-1 text-tinta-suave">
            {can.manage ? "Cuando el cliente pida desde el QR, o agregues productos, la ronda aparecerá aquí." : "Cuando la mesa pida, la ronda aparecerá aquí."}
          </p>
        </div>
      )}

      {/* Barra de acciones fija: total en vivo + agregar + finalizar */}
      {can.manage || (order && can.close) ? (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-tinta/15 bg-white print:hidden">
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {order && totals ? (
              <p className="mr-auto leading-tight">
                <span className="block text-sm text-tinta-suave">Subtotal</span>
                <span className="font-display text-2xl font-semibold tabular-nums [font-stretch:87.5%]">
                  {money(totals.subtotal)}
                </span>
              </p>
            ) : (
              <span className="mr-auto" />
            )}
            {can.manage ? (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setSheet("add")}
                className="min-h-13 flex-1 rounded-xl border-2 border-tinta bg-white px-4 text-lg font-bold text-tinta hover:bg-tinta/5 sm:flex-none"
              >
                Agregar productos
              </button>
            ) : null}
            {order && can.close ? (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setSheet("close")}
                className="min-h-13 flex-1 rounded-xl bg-tinta px-5 text-lg font-bold text-plato hover:bg-tinta/90 sm:flex-none"
              >
                Finalizar servicio
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {can.manage ? (
        <AddItemsSheet
          open={sheet === "add"}
          onClose={() => setSheet(null)}
          tableId={table.id}
          tableNumber={table.number}
          currency={settings.currency}
          onAdded={refresh}
        />
      ) : null}
      {order && can.close ? (
        <CloseServiceSheet
          open={sheet === "close"}
          onClose={() => setSheet(null)}
          orderId={order.id}
          rounds={order.rounds}
          settings={settings}
          unserved={unserved}
          onClosed={() => {
            setSheet(null);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}
