"use client";

// Plano de mesas en vivo. "Señal + refetch": el SSE del staff (waiter:{id} o staff:floor)
// invalida ["floor"]; además refetch al enfocar y cada 60 s como red de seguridad.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { acknowledgeTable, getFloor } from "@/app/actions/floor.actions";
import type { FloorTable, FloorZone } from "@/lib/domain/floor";
import { toastFor } from "@/lib/floor-view";
import type { RealtimeEvent, RealtimePayload } from "@/lib/realtime/events";
import { useRealtimeInvalidate } from "@/lib/realtime/use-channel";
import { TableTile } from "./TableTile";
import { Toasts, type Toast } from "./Toasts";
import { beep, useSoundPreference } from "./use-sound";

type Props = { initialZones: FloorZone[]; serverNow: number; isWaiter: boolean };

let toastSeq = 0;

export function FloorBoard({ initialZones, serverNow, isWaiter }: Props) {
  const qc = useQueryClient();
  const { data: zones = initialZones, isError } = useQuery({
    queryKey: ["floor"],
    queryFn: async () => {
      const r = await getFloor();
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    initialData: initialZones,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const [sound, setSound] = useSoundPreference();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [acking, setAcking] = useState<string | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);

  // Reloj para "hace n min": arranca en la hora del servidor (sin desajuste de hidratación).
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const onEvent = useCallback(
    (event: RealtimeEvent, payload: RealtimePayload) => {
      // Pulsa la mesa que cambió por el cliente (no por "Atendido" ni el duplicado sin mesero)
      if (payload.tableId && event !== "order.unassigned" && event !== "table.updated") {
        const tableId = payload.tableId;
        setPulses((p) => ({ ...p, [tableId]: (p[tableId] ?? 0) + 1 }));
      }
      const toast = toastFor(event, payload);
      if (!toast) return;
      setToasts((ts) => [...ts.slice(-3), { id: ++toastSeq, ...toast }]);
      if (sound) beep(toast.tone === "call");
    },
    [sound],
  );

  const { connected } = useRealtimeInvalidate("/api/events", [["floor"]], onEvent);
  const [everConnected, setEverConnected] = useState(false);
  if (connected && !everConnected) setEverConnected(true);
  const reconnecting = everConnected && !connected;

  async function onAck(table: FloorTable) {
    setAcking(table.id);
    setAckError(null);
    const r = await acknowledgeTable(table.id);
    setAcking(null);
    if (!r.ok) setAckError(`Mesa ${table.number}: ${r.error}`);
    // El evento table.updated refresca el plano; por si el stream está caído, también aquí.
    void qc.invalidateQueries({ queryKey: ["floor"] });
  }

  const calling = zones.flatMap((z) => z.tables).filter((t) => t.status === "NEEDS_ATTENTION").length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tinta/12 pb-3">
        <p className={`text-[15px] ${calling > 0 ? "font-bold text-guindilla" : "text-tinta-suave"}`}>
          {calling === 0
            ? "Ninguna mesa está llamando."
            : calling === 1
              ? "1 mesa está llamando."
              : `${calling} mesas están llamando.`}
        </p>
        <div className="flex items-center gap-3">
          {reconnecting && (
            <span role="status" className="flex items-center gap-1.5 text-[15px] font-bold text-guindilla">
              <span aria-hidden="true" className="size-2 rounded-full bg-guindilla" />
              Reconectando…
            </span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={sound}
            onClick={() => {
              setSound(!sound);
              if (!sound) beep();
            }}
            className="flex min-h-11 items-center gap-2 rounded-md px-2 font-bold text-tinta hover:bg-tinta/5"
          >
            <span
              aria-hidden="true"
              className={`relative h-6 w-10 rounded-full border-2 border-tinta transition-colors ${sound ? "bg-tinta" : "bg-white"}`}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full transition-[left] ${sound ? "left-[18px] bg-plato" : "left-0.5 bg-tinta"}`}
              />
            </span>
            Sonido
          </button>
        </div>
      </div>

      {(isError || ackError) && (
        <p role="alert" className="mt-4 rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2">
          {ackError ?? "No pudimos actualizar el plano. Lo reintentamos en un momento."}
        </p>
      )}

      {zones.length === 0 ? (
        <div className="py-12">
          <p className="font-display text-2xl font-semibold">{isWaiter ? "No tienes mesas asignadas." : "No hay mesas activas."}</p>
          <p className="mt-1 text-tinta-suave">
            {isWaiter ? "Pide a administración que te asigne una zona o una mesa." : "Activa mesas desde administración."}
          </p>
        </div>
      ) : (
        zones.map((zone) => (
          <section key={zone.id} aria-labelledby={`zona-${zone.id}`} className="mt-6">
            <h2
              id={`zona-${zone.id}`}
              className="flex items-baseline justify-between border-b-2 border-tinta pb-1 font-display text-xl font-semibold [font-stretch:87.5%]"
            >
              {zone.name}
              <span className="font-sans text-[15px] font-normal text-tinta-suave">
                {zone.tables.length} {zone.tables.length === 1 ? "mesa" : "mesas"}
              </span>
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {zone.tables.map((t) => (
                <TableTile
                  key={t.id}
                  table={t}
                  now={now}
                  pulse={pulses[t.id] ?? 0}
                  acking={acking === t.id}
                  onAck={onAck}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
