"use client";

import Link from "next/link";
import { useState } from "react";
import { cartCount, cartTotal, type CartLineView } from "@/lib/cart";
import { formatMoney } from "@/lib/money";
import { NoteField } from "./NoteField";
import { QuantityStepper } from "./QuantityStepper";
import { Sheet } from "./Sheet";

export type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; round: number }
  | { kind: "error"; message: string };

type Props = {
  open: boolean;
  onClose: () => void;
  token: string;
  lines: CartLineView[];
  send: SendState;
  onSend: () => void;
  onQuantity: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  onNote: (key: string, note: string) => void;
};

export function CartSheet({ open, onClose, token, lines, send, onSend, onQuantity, onRemove, onNote }: Props) {
  const count = cartCount(lines);
  const total = cartTotal(lines);

  if (send.kind === "sent") {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={`Pedido enviado · Ronda ${send.round}`}
        footer={
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-13 w-full items-center justify-center rounded-xl border-2 border-tinta px-5 text-lg font-bold text-tinta"
          >
            Seguir pidiendo
          </button>
        }
      >
        <div role="status" className="flex gap-3">
          <span aria-hidden="true" className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-albahaca text-white">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p className="text-lg">La cocina ya tiene tu pedido. Puedes seguir su estado en tu cuenta.</p>
            <Link
              href={`/m/${token}/cuenta`}
              className="mt-3 inline-flex min-h-11 items-center font-bold text-tinta underline decoration-2 underline-offset-4"
            >
              Ver mi cuenta
            </Link>
          </div>
        </div>
      </Sheet>
    );
  }

  const sending = send.kind === "sending";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Tu pedido"
      subtitle={lines.length ? `${count} ${count === 1 ? "plato" : "platos"} por enviar` : undefined}
      footer={
        lines.length ? (
          <div className="flex flex-col gap-3">
            {send.kind === "error" ? (
              <p role="alert" className="rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2 text-tinta">
                {send.message}
              </p>
            ) : null}
            <div className="flex items-baseline justify-between gap-3">
              <span>
                <span className="font-bold">Total estimado</span>
                <span className="block text-sm text-tinta-suave">El valor final aparece en tu cuenta.</span>
              </span>
              <span className="font-display text-2xl font-semibold tabular-nums">{formatMoney(total)}</span>
            </div>
            <button
              type="button"
              onClick={onSend}
              disabled={sending || count === 0}
              aria-disabled={sending || count === 0}
              className="flex min-h-13 w-full items-center justify-center rounded-xl bg-tinta px-5 text-lg font-bold text-plato hover:bg-[#25365c] disabled:bg-tinta/45"
            >
              {sending ? "Enviando…" : "Enviar pedido"}
            </button>
          </div>
        ) : undefined
      }
    >
      {lines.length === 0 ? (
        <div className="py-6">
          <p className="text-lg">Aún no has agregado platos.</p>
          <p className="mt-1 text-tinta-suave">Toca un plato del menú para agregarlo a tu pedido.</p>
        </div>
      ) : (
        <ul className="-mt-4">
          {lines.map((l) => (
            <CartLineItem
              key={l.key}
              line={l}
              disabled={sending}
              onQuantity={onQuantity}
              onRemove={onRemove}
              onNote={onNote}
            />
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function CartLineItem({
  line: l,
  disabled,
  onQuantity,
  onRemove,
  onNote,
}: {
  line: CartLineView;
  disabled: boolean;
  onQuantity: Props["onQuantity"];
  onRemove: Props["onRemove"];
  onNote: Props["onNote"];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(l.note);

  return (
    <li className="border-b border-tinta/12 py-4 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`font-display text-xl leading-snug font-semibold [font-stretch:87.5%] ${l.unavailable ? "text-tinta-suave" : ""}`}
        >
          {l.name}
        </span>
        {l.unavailable ? null : (
          <span className="text-lg whitespace-nowrap tabular-nums">{formatMoney(l.unitPrice * l.quantity)}</span>
        )}
      </div>

      {l.unavailable ? (
        <p className="mt-1 font-bold text-guindilla">Ya no está disponible</p>
      ) : l.note && !editing ? (
        <p className="mt-1 text-tinta-suave">Nota: {l.note}</p>
      ) : null}

      {editing ? (
        <div className="mt-3">
          <NoteField value={draft} onChange={setDraft} autoFocus />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onNote(l.key, draft);
                setEditing(false);
              }}
              className="min-h-11 rounded-lg bg-tinta px-4 font-bold text-plato"
            >
              Guardar nota
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(l.note);
                setEditing(false);
              }}
              className="min-h-11 rounded-lg px-4 text-tinta underline underline-offset-4"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
        {l.unavailable ? null : (
          <QuantityStepper
            value={l.quantity}
            onChange={(n) => onQuantity(l.key, n)}
            label={l.name}
          />
        )}
        {l.unavailable || editing ? null : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setDraft(l.note);
              setEditing(true);
            }}
            className="min-h-11 px-2 text-tinta underline underline-offset-4 disabled:text-tinta-suave"
          >
            {l.note ? "Editar nota" : "Añadir nota"}
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRemove(l.key)}
          className="ml-auto min-h-11 px-2 text-guindilla underline underline-offset-4 disabled:text-tinta-suave"
          aria-label={`Quitar ${l.name} del pedido`}
        >
          Quitar
        </button>
      </div>
    </li>
  );
}
