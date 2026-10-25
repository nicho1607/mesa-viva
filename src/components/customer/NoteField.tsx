"use client";

import { useId } from "react";
import { appendSuggestion, MAX_NOTE } from "@/lib/cart";

export const NOTE_SUGGESTIONS = ["Sin cebolla", "Término medio", "Salsa aparte"] as const;

type Props = {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  autoFocus?: boolean;
};

/** Campo de nota para cocina (máx. 200) con sugerencias rápidas que se añaden al final. */
export function NoteField({ value, onChange, label = "Nota para la cocina", autoFocus }: Props) {
  const id = useId();
  const counterId = `${id}-counter`;
  const remaining = MAX_NOTE - value.length;
  return (
    <div>
      <label htmlFor={id} className="font-bold">
        {label} <span className="font-normal text-tinta-suave">(opcional)</span>
      </label>
      <textarea
        id={id}
        value={value}
        maxLength={MAX_NOTE}
        rows={3}
        autoFocus={autoFocus}
        aria-describedby={counterId}
        placeholder="Ej.: bien caliente, sin hielo…"
        onChange={(e) => onChange(e.target.value.slice(0, MAX_NOTE))}
        className="mt-2 block w-full resize-none rounded-lg border border-tinta/30 bg-plato px-3 py-2.5 text-base text-tinta placeholder:text-tinta-suave/80 focus:border-tinta focus-visible:outline-azafran"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {NOTE_SUGGESTIONS.map((s) => {
          const used = value.toLowerCase().includes(s.toLowerCase());
          return (
            <button
              key={s}
              type="button"
              disabled={used || value.length + s.length + 2 > MAX_NOTE}
              onClick={() => onChange(appendSuggestion(value, s))}
              className="min-h-11 rounded-full border border-tinta/25 px-3.5 text-sm text-tinta hover:border-tinta disabled:border-tinta/10 disabled:text-tinta-suave"
            >
              {used ? `✓ ${s}` : `+ ${s}`}
            </button>
          );
        })}
      </div>
      <p id={counterId} className="mt-1 text-right text-sm text-tinta-suave tabular-nums" aria-live="polite">
        {value.length}/{MAX_NOTE}
        <span className="sr-only">{remaining <= 20 ? `, quedan ${remaining} caracteres` : ""}</span>
      </p>
    </div>
  );
}
