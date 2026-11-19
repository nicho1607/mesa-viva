"use client";

import { useId, useState } from "react";
import type { MenuProduct } from "@/lib/domain/queries";
import { clampQty } from "@/lib/cart";
import { useLanguage } from "./LanguageProvider";
import { TranslatedContent } from "./TranslatedContent";
import { NoteField } from "./NoteField";
import { QuantityStepper } from "./QuantityStepper";
import { Sheet } from "./Sheet";

type Props = {
  open?: boolean;
  product: MenuProduct | null;
  onClose: () => void;
  onAdd: (input: { product: MenuProduct; quantity: number; note: string }) => void;
};

export function DishSheet({ product, open = true, onClose, onAdd }: Props) {
  return product ? <DishForm key={product.id} product={product} open={open} onClose={onClose} onAdd={onAdd} /> : null;
}

function DishForm({ product, open, onClose, onAdd }: Omit<Props, "product"> & { product: MenuProduct }) {
  const { t, money, locale } = useLanguage();
  const formId = useId();
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  return (
    <Sheet
      open={!!open}
      mobileTop
      onClose={onClose}
      title={<TranslatedContent original={product.name} english={product.nameEn} />}
      subtitle={product.description ? <TranslatedContent original={product.description} english={product.descriptionEn} /> : undefined}
      footer={
        <button
          type="submit"
          form={formId}
          className="flex min-h-13 w-full flex-wrap items-center justify-center gap-x-1 rounded-xl bg-tinta px-[20px] text-lg font-bold text-plato hover:bg-tinta/90"
        >
          {t("add")} · <span className="max-w-full min-w-0 tabular-nums">{money(product.price * quantity)}</span>
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
          <span className="text-lg tabular-nums">{money(product.price)} {t("each")}</span>
          <QuantityStepper value={quantity} onChange={(n) => setQuantity(clampQty(n))} label={locale === "en" && product.nameEn ? product.nameEn : product.name} size="lg" />
        </div>
        <NoteField value={note} onChange={setNote} />
      </form>
    </Sheet>
  );
}
