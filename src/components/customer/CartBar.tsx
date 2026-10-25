"use client";

import { formatMoney } from "@/lib/money";

type Props = { count: number; total: number; onOpen: () => void };

/** Barra fija inferior "Ver pedido (n) · $total". Solo aparece cuando hay platos. */
export function CartBar({ count, total, onOpen }: Props) {
  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="mx-auto flex min-h-14 w-full max-w-lg items-center justify-between gap-3 rounded-xl bg-tinta px-5 text-plato shadow-[0_6px_20px_-6px_rgb(29_43_74/0.55)] hover:bg-[#25365c]"
      >
        <span className="text-lg font-bold">
          Ver pedido <span className="tabular-nums">({count})</span>
        </span>
        <span className="text-lg tabular-nums">
          <span className="sr-only"> · </span>
          {formatMoney(total)}
        </span>
      </button>
    </div>
  );
}
