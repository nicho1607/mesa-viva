"use client";

// "Agregar productos" en nombre del cliente: carta con búsqueda y categorías, cada plato se
// despliega en línea (cantidad + nota) y se acumula en una ronda que se envía de una vez.
// Reusa la lógica pura del carrito (`@/lib/cart`) y los campos del cliente (NoteField, QuantityStepper).

import { useQuery } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { getMenu } from "@/app/actions/order.actions";
import { addItemsForTableAction } from "@/app/actions/table.actions";
import { NoteField } from "@/components/customer/NoteField";
import { QuantityStepper } from "@/components/customer/QuantityStepper";
import { Sheet } from "@/components/customer/Sheet";
import { addLine, cartCount, cartTotal, clampQty, removeLine, toSubmitItems, type Cart } from "@/lib/cart";
import type { MenuProduct } from "@/lib/domain/queries";
import { formatMoney } from "@/lib/money";

type Props = {
  open: boolean;
  onClose: () => void;
  tableId: string;
  tableNumber: number;
  currency: string;
  onAdded: () => void;
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function AddItemsSheet({ open, onClose, tableId, tableNumber, currency, onAdded }: Props) {
  const searchId = useId();
  const money = (c: number) => formatMoney(c, currency);
  const menu = useQuery({
    queryKey: ["menu"],
    queryFn: () => getMenu(),
    enabled: open,
    staleTime: 60_000,
  });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState<Cart>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  const visible = useMemo(() => {
    const q = fold(query.trim());
    return (menu.data ?? [])
      .filter((c) => !category || c.id === category)
      .map((c) => ({ ...c, products: q ? c.products.filter((p) => fold(p.name).includes(q)) : c.products }))
      .filter((c) => c.products.length > 0);
  }, [menu.data, query, category]);

  function close() {
    setExpanded(null);
    setSent(null);
    setError(null);
    onClose();
  }

  async function send() {
    setSending(true);
    setError(null);
    const r = await addItemsForTableAction(tableId, toSubmitItems(draft));
    setSending(false);
    if (!r.ok) {
      setError(r.error);
      if (r.code === "UNAVAILABLE_PRODUCTS") void menu.refetch();
      return;
    }
    setDraft([]);
    setExpanded(null);
    setSent(r.data.round);
    onAdded();
  }

  const count = cartCount(draft);

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Agregar productos"
      subtitle={`Mesa ${tableNumber}, en nombre del cliente`}
      footer={
        <div className="flex flex-col gap-3">
          {sent !== null && count === 0 ? (
            <p role="status" className="rounded-lg bg-albahaca px-3 py-2 font-bold text-white">
              Ronda {sent} enviada a la cuenta.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2">
              {error}
            </p>
          ) : null}
          {count > 0 ? (
            <ul aria-label="Productos de esta ronda" className="max-h-32 overflow-y-auto">
              {draft.map((l) => (
                <li key={l.key} className="flex items-center gap-2 py-0.5">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-bold tabular-nums">{l.quantity}×</span> {l.name}
                    {l.note ? <span className="text-tinta-suave"> ({l.note})</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDraft((d) => removeLine(d, l.key))}
                    className="min-h-11 rounded-md px-2 text-sm font-bold text-guindilla hover:bg-guindilla/8"
                    aria-label={`Quitar ${l.name}`}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            disabled={count === 0 || sending}
            onClick={() => void send()}
            className="flex min-h-13 w-full items-center justify-center rounded-xl bg-tinta px-5 text-lg font-bold text-plato hover:bg-tinta/90 disabled:bg-tinta/40"
          >
            {sending
              ? "Enviando…"
              : count === 0
                ? "Elige productos para la ronda"
                : `Enviar ronda (${count}) · ${money(cartTotal(draft))}`}
          </button>
        </div>
      }
    >
      {/* Altura mínima: la hoja no salta al filtrar */}
      <div className="min-h-[55dvh]">
        <label htmlFor={searchId} className="sr-only">
          Buscar en la carta
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar plato o bebida"
          autoComplete="off"
          className="min-h-12 w-full rounded-lg border border-tinta/30 bg-plato px-3 text-base placeholder:text-tinta-suave/80 focus:border-tinta focus-visible:outline-azafran"
        />
        <div
          role="group"
          aria-label="Categorías"
          className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
        >
          {[
            { id: null as string | null, name: "Todo" },
            ...(menu.data ?? []).map((c) => ({ id: c.id as string | null, name: c.name })),
          ].map((c) => (
            <button
              key={c.id ?? "all"}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
              className={`min-h-11 shrink-0 rounded-full border px-4 font-bold whitespace-nowrap ${
                category === c.id ? "border-tinta bg-tinta text-plato" : "border-tinta/25 text-tinta hover:border-tinta"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {menu.isPending ? (
          <p className="py-6 text-tinta-suave">Cargando la carta…</p>
        ) : menu.isError ? (
          <p role="alert" className="mt-4 rounded-lg border-l-4 border-guindilla bg-guindilla/8 px-3 py-2">
            No pudimos cargar la carta. Cierra y vuelve a intentarlo.
          </p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-tinta-suave">Nada coincide con “{query}”.</p>
        ) : (
          visible.map((c) => (
            <section key={c.id} className="mt-5">
              <h3 className="border-b-2 border-tinta pb-1 font-display text-lg font-semibold [font-stretch:87.5%]">
                {c.name}
              </h3>
              <ul>
                {c.products.map((p) => (
                  <li key={p.id} className="border-b border-tinta/12">
                    <ProductRow
                      product={p}
                      money={money}
                      expanded={expanded === p.id}
                      onToggle={() => setExpanded((e) => (e === p.id ? null : p.id))}
                      onAdd={(quantity, note) => {
                        setDraft((d) =>
                          addLine(d, { productId: p.id, name: p.name, unitPrice: p.price, quantity, note }),
                        );
                        setExpanded(null);
                        setSent(null);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </Sheet>
  );
}

function ProductRow({
  product: p,
  money,
  expanded,
  onToggle,
  onAdd,
}: {
  product: MenuProduct;
  money: (c: number) => string;
  expanded: boolean;
  onToggle: () => void;
  onAdd: (quantity: number, note: string) => void;
}) {
  const head = (
    <span className="flex items-baseline gap-2">
      <span
        className={`font-display text-lg leading-snug font-semibold [font-stretch:87.5%] ${p.available ? "" : "text-tinta-suave"}`}
      >
        {p.name}
      </span>
      <span aria-hidden="true" className="mb-1 min-w-4 flex-1 self-end border-b-2 border-dotted border-tinta/20" />
      {p.available ? (
        <span className="whitespace-nowrap tabular-nums">{money(p.price)}</span>
      ) : (
        <span className="font-bold whitespace-nowrap text-guindilla">Agotado</span>
      )}
    </span>
  );
  if (!p.available) return <div className="py-3">{head}</div>;
  return (
    <>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-3 text-left hover:bg-tinta/[0.03]"
      >
        {head}
      </button>
      {expanded ? <ProductForm key={p.id} product={p} money={money} onAdd={onAdd} /> : null}
    </>
  );
}

function ProductForm({
  product,
  money,
  onAdd,
}: {
  product: MenuProduct;
  money: (c: number) => string;
  onAdd: (quantity: number, note: string) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(quantity, note);
      }}
      className="mb-3 flex flex-col gap-4 rounded-lg bg-plato p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold">Cantidad</span>
        <QuantityStepper value={quantity} onChange={(n) => setQuantity(clampQty(n))} label={product.name} />
      </div>
      <NoteField value={note} onChange={setNote} />
      <button type="submit" className="min-h-12 rounded-lg bg-tinta px-4 font-bold text-plato hover:bg-tinta/90">
        Añadir a la ronda · <span className="tabular-nums">{money(product.price * quantity)}</span>
      </button>
    </form>
  );
}
