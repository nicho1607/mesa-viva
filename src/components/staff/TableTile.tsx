"use client";

// Una mesa del plano. El estado se lee por el color del borde Y por la etiqueta con icono
// (nunca solo por color). Las llamadas llevan franja llena y botón "Atendido".

import Link from "next/link";
import type { FloorTable } from "@/lib/domain/floor";
import { TILE_LABEL, needsAck, openedLabel, tileKind, type TileKind } from "@/lib/floor-view";

const FRAME: Record<TileKind, string> = {
  bill: "border-guindilla bg-white",
  assistance: "border-guindilla bg-white",
  pending: "border-azafran bg-white",
  occupied: "border-tinta bg-white",
  free: "border-dashed border-tinta-suave/50 bg-transparent",
};

const STRIP: Record<TileKind, string> = {
  bill: "bg-guindilla text-white",
  assistance: "bg-guindilla text-white",
  pending: "bg-azafran text-tinta",
  occupied: "text-tinta",
  free: "text-tinta-suave",
};

function Icon({ kind }: { kind: TileKind }) {
  const common = {
    "aria-hidden": true,
    viewBox: "0 0 20 20",
    className: "size-[18px] shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "assistance": // campana
      return (
        <svg {...common}>
          <path d="M5 14V9a5 5 0 0 1 10 0v5l1.5 1.5h-13L5 14Z" />
          <path d="M8.5 17.5a1.5 1.5 0 0 0 3 0" />
        </svg>
      );
    case "bill": // recibo
      return (
        <svg {...common}>
          <path d="M5 2.5h10v15l-2-1.3-1.5 1.3-1.5-1.3-1.5 1.3L7 16.2l-2 1.3v-15Z" />
          <path d="M8 7h4M8 10h4" />
        </svg>
      );
    case "pending": // ronda nueva (comanda con punto)
      return (
        <svg {...common}>
          <path d="M4 4h12M4 9h8M4 14h6" />
          <circle cx="15.5" cy="13.5" r="2.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "occupied": // plato
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="7" />
          <circle cx="10" cy="10" r="3.5" />
        </svg>
      );
    default: // libre: círculo vacío punteado
      return (
        <svg {...common} strokeDasharray="2.5 2.5">
          <circle cx="10" cy="10" r="7" />
        </svg>
      );
  }
}

type Props = {
  table: FloorTable;
  now: number;
  pulse: number; // >0 → pulsa una vez (cambia la key para repetir)
  acking: boolean;
  onAck: (table: FloorTable) => void;
};

export function TableTile({ table, now, pulse, acking, onAck }: Props) {
  const kind = tileKind(table);
  const o = table.order;
  const label = TILE_LABEL[kind];
  const ack = needsAck(kind);

  return (
    <li
      className={`relative flex flex-col overflow-hidden rounded-lg border-[3px] ${FRAME[kind]}`}
      style={{ ["--pulse" as string]: kind === "pending" ? "var(--azafran)" : "var(--guindilla)" }}
    >
      {pulse > 0 && <span key={pulse} aria-hidden="true" className="mv-pulse pointer-events-none absolute inset-0" />}
      <Link
        href={`/staff/mesas/${table.id}`}
        aria-label={`Mesa ${table.number}, ${label}. Ver detalle`}
        className="relative flex flex-1 flex-col outline-offset-[-3px] hover:bg-tinta/[0.03]"
      >
        <span className={`flex min-h-9 items-center gap-1.5 px-3 text-[15px] font-bold leading-tight ${STRIP[kind]}`}>
          <Icon kind={kind} />
          {label}
        </span>
        <span className="flex items-baseline justify-between gap-2 px-3 pt-1">
          <span className="font-display text-5xl font-semibold leading-none tabular-nums tracking-tight [font-stretch:87.5%]">
            {table.number}
          </span>
          <span className="text-right text-sm text-tinta-suave">{table.seats} puestos</span>
        </span>
        <span className="flex flex-1 flex-col gap-0.5 px-3 pb-3 pt-2 text-[15px] leading-snug">
          {o ? (
            <>
              <span className="flex flex-wrap gap-x-3">
                {o.pendingCount > 0 && (
                  <span className="font-bold">
                    <span className="tabular-nums">{o.pendingCount}</span> por confirmar
                  </span>
                )}
                {o.inPrepCount > 0 && (
                  <span>
                    <span className="tabular-nums">{o.inPrepCount}</span> en cocina
                  </span>
                )}
                {o.servedCount > 0 && (
                  <span>
                    <span className="tabular-nums">{o.servedCount}</span>{" "}
                    {o.servedCount === 1 ? "servido" : "servidos"}
                  </span>
                )}
                {o.pendingCount + o.inPrepCount + o.servedCount === 0 && <span>Sin platos activos</span>}
              </span>
              <span className="text-tinta-suave">
                Ronda {o.lastRound}, {openedLabel(o.openedAt, now).toLowerCase()}
              </span>
            </>
          ) : (
            <span className="text-tinta-suave">{kind === "free" ? "Sin pedido" : "Sin pedido abierto"}</span>
          )}
        </span>
      </Link>
      {ack && (
        <button
          type="button"
          onClick={() => onAck(table)}
          disabled={acking}
          className="relative m-2 mt-0 min-h-11 rounded-md bg-tinta px-3 font-bold text-plato hover:bg-tinta/90 disabled:opacity-60"
        >
          {acking ? "Guardando…" : "Atendido"}
        </button>
      )}
    </li>
  );
}
