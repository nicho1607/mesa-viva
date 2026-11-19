"use client";

import { useId, useState } from "react";
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
  return product ? <DishForm key={product.id} product={product} onClose={onClose} onAdd={onAdd} /> : null;
}

function DishForm({ product, onClose, onAdd }: Omit<Props, "product"> & { product: MenuProduct }) {
  const formId = useId();
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  return (
    <Sheet
      open
      mobileTop
      onClose={onClose}
      title={product.name}
      subtitle={product.description ?? undefined}
      footer={
        <button
          type="submit"
          form={formId}
          className="flex min-h-13 w-full items-center justify-center rounded-xl bg-tinta px-5 text-lg font-bold text-plato hover:bg-tinta/90"
        >
          Agregar · <span className="ml-1.5 tabular-nums">{formatMoney(product.price * quantity)}</span>
        </button>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          onAdd({ product, quantity, note });
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-lg tabular-nums">{formatMoney(product.price)} c/u</span>
          <QuantityStepper value={quantity} onChange={(n) => setQuantity(clampQty(n))} label={product.name} size="lg" />
        </div>
        <NoteField value={note} onChange={setNote} />
      </form>
    </Sheet>
  );
}
