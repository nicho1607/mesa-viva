"use client";

// La carta: filas alineadas a la izquierda, nombre — puntos guía — precio a la derecha.
// Funciona sin imágenes (el seed no trae); si un plato tiene imagen se muestra a la derecha.

import type { MenuCategory, MenuProduct } from "@/lib/domain/queries";
import { formatMoney } from "@/lib/money";
import { sectionId } from "./CategoryTabs";

type Props = {
  categories: MenuCategory[];
  /** Cantidad de cada producto que ya está en el pedido (para la marca "2 en tu pedido"). */
  inCart: ReadonlyMap<string, number>;
  onSelect: (product: MenuProduct) => void;
};

export function MenuList({ categories, inCart, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-10 pt-6">
      {categories.map((c) => (
        <section key={c.id} id={sectionId(c.id)} aria-labelledby={`${sectionId(c.id)}-h`} className="scroll-mt-16">
          <h2
            id={`${sectionId(c.id)}-h`}
            className="font-display text-[1.75rem] leading-none font-semibold tracking-tight [font-stretch:87.5%]"
          >
            {c.name}
          </h2>
          <ul className="mt-3 border-t-2 border-tinta">
            {c.products.map((p) => (
              <li key={p.id} className="border-b border-tinta/12">
                <DishRow product={p} count={inCart.get(p.id) ?? 0} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DishRow({ product: p, count, onSelect }: { product: MenuProduct; count: number; onSelect: Props["onSelect"] }) {
  const body = (
    <>
      <span className="flex items-baseline gap-2">
        <span
          className={`font-display text-xl leading-snug font-semibold [font-stretch:87.5%] ${p.available ? "" : "text-tinta-suave"}`}
        >
          {p.name}
        </span>
        <span aria-hidden="true" className="mb-1 min-w-4 flex-1 self-end border-b-2 border-dotted border-tinta/25" />
        {p.available ? (
          <span className="text-lg whitespace-nowrap tabular-nums">{formatMoney(p.price)}</span>
        ) : (
          <span className="font-bold whitespace-nowrap text-guindilla">Agotado</span>
        )}
      </span>
      {p.description ? <span className="mt-1 block max-w-[60ch] text-tinta-suave">{p.description}</span> : null}
      {count > 0 ? (
        <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-tinta">
          <span aria-hidden="true" className="size-2 rounded-full bg-azafran" />
          {count} en tu pedido
        </span>
      ) : null}
    </>
  );

  if (!p.available) {
    return (
      <div className="flex gap-4 py-4">
        <div className="min-w-0 flex-1">{body}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(p)}
      aria-haspopup="dialog"
      className="-mx-2 flex w-[calc(100%+1rem)] gap-4 rounded-md px-2 py-4 text-left hover:bg-tinta/[0.03] active:bg-tinta/5"
    >
      <span className="block min-w-0 flex-1">{body}</span>
      {p.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- imágenes opcionales de origen libre
        <img src={p.imageUrl} alt="" className="size-20 shrink-0 rounded-md object-cover" loading="lazy" />
      ) : null}
    </button>
  );
}
