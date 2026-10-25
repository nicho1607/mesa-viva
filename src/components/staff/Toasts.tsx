"use client";

// Avisos apilados (esquina inferior). Se cierran solos a los 6 s o con la ✕.

import { useEffect } from "react";

export type Toast = { id: number; text: string; tone: "round" | "call" };

const TTL_MS = 6_000;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), TTL_MS);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const call = toast.tone === "call";
  return (
    <li
      className={`pointer-events-auto flex items-center gap-2 rounded-lg border-l-[6px] bg-tinta py-1 pl-4 pr-1 text-plato shadow-lg ${
        call ? "border-guindilla" : "border-azafran"
      }`}
    >
      <span className="flex-1 font-display text-lg font-semibold [font-stretch:87.5%]">{toast.text}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={`Cerrar aviso: ${toast.text}`}
        className="grid size-11 shrink-0 place-items-center rounded-md text-plato/80 hover:bg-plato/10 hover:text-plato"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3l10 10M13 3L3 13" />
        </svg>
      </button>
    </li>
  );
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-20 flex justify-end sm:left-auto sm:right-6 sm:w-96"
    >
      <ul className="flex w-full flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </ul>
    </div>
  );
}
