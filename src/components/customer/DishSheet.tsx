"use client";

import { useState } from "react";
import type { MenuProduct } from "@/lib/domain/queries";
import { clampQty } from "@/lib/cart";
import { formatMoney } from "@/lib/money";
import { NoteField } from "./NoteField";
import { QuantityStepper } from "./QuantityStepper";
import { Sheet } from "./Sheet";

type Props = {
  product: MenuProduct | null;
  onClose: () => void;
  onAdd: (input: { product: MenuProduct; quantity: number; note: string }) => void;
};

export function DishSheet({ product, onClose, onAdd }: Props) {
  return (
    <Sheet
      open={product !== null}
      onClose={onClose}
      title={product?.name ?? ""}
      subtitle={product?.description ?? undefined}
    >
      {/* key: estado nuevo (cantidad 1, nota vacía) para cada plato */}
      {product ? <DishForm key={product.id} product={product} onAdd={onAdd} /> : null}
    </Sheet>
  );
}

function DishForm({ product, onAdd }: { product: MenuProduct; onAdd: Props["onAdd"] }) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd({ product, quantity, note });
      }}
      className="flex flex-col gap-6"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-lg tabular-nums">{formatMoney(product.price)} c/u</span>
        <QuantityStepper value={quantity} onChange={(n) => setQuantity(clampQty(n))} label={product.name} size="lg" />
      </div>
      <NoteField value={note} onChange={setNote} />
      <button
        type="submit"
        className="flex min-h-13 w-full items-center justify-center rounded-xl bg-tinta px-5 text-lg font-bold text-plato hover:bg-tinta/90"
      >
        Agregar · <span className="ml-1.5 tabular-nums">{formatMoney(product.price * quantity)}</span>
      </button>
    </form>
  );
}
