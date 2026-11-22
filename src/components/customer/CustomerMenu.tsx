"use client";

// Orquesta el menú del cliente: pestañas, carta, hoja de plato, carrito y envío.

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { submitOrder } from "@/app/actions/order.actions";
import {
  addLine,
  cartCount,
  cartTotal,
  reconcile,
  removeLine,
  toSubmitItems,
  updateNote,
  updateQuantity,
  type MenuInfo,
} from "@/lib/cart";
import type { MenuCategory, MenuProduct } from "@/lib/domain/queries";
import { CartBar } from "./CartBar";
import { CartSheet, type SendState } from "./CartSheet";
import { CategoryTabs } from "./CategoryTabs";
import { DishSheet } from "./DishSheet";
import { MenuList } from "./MenuList";
import { useCart } from "./use-cart";
import { useOrderOperation } from "./use-order-operation";

type Props = { token: string; categories: MenuCategory[] };

export function CustomerMenu({ token, categories }: Props) {
  const router = useRouter();
  const [cart, setCart] = useCart(token);
  const operation = useOrderOperation(token);
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const [dishOpen, setDishOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [send, setSend] = useState<SendState>({ kind: "idle" });
  // Productos que el servidor rechazó como no disponibles en el último envío.
  const [rejected, setRejected] = useState<ReadonlySet<string>>(new Set());

  const menu = useMemo(() => {
    const m = new Map<string, MenuInfo & { nameEn?: string | null }>();
    for (const c of categories) for (const p of c.products) m.set(p.id, p);
    return m;
  }, [categories]);

  const lines = useMemo(() => reconcile(cart, menu, rejected), [cart, menu, rejected]);
  const inCart = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) if (!l.unavailable) m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity);
    return m;
  }, [lines]);

  const resetSendError = () => setSend((s) => (s.kind === "error" ? { kind: "idle" } : s));

  async function handleSend() {
    const items = toSubmitItems(lines);
    if (items.length === 0 || send.kind === "sending") return;
    setSend({ kind: "sending" });
    const operationId = operation.getOrCreate(JSON.stringify(items));
    let res: Awaited<ReturnType<typeof submitOrder>>;
    try {
      res = await submitOrder(token, items, operationId);
    } catch {
      setSend({ kind: "error", code: "NETWORK" });
      return;
    }
    if (res.ok) {
      operation.clear();
      setCart(() => []);
      setRejected(new Set());
      setSend({ kind: "sent", round: res.data.round });
      return;
    }
    if (res.code === "UNAVAILABLE_PRODUCTS" && res.details?.productIds?.length) {
      setRejected(new Set(res.details.productIds));
      router.refresh(); // el menú también mostrará "Agotado"
      setSend({
        kind: "error",
        code: "UNAVAILABLE_PRODUCTS",
      });
      return;
    }
    if (res.code === "INSUFFICIENT_STOCK") {
      const empty = res.details?.shortages?.filter((s) => s.available === 0).map((s) => s.productId) ?? [];
      if (empty.length) setRejected(new Set(empty));
      router.refresh();
      setSend({ kind: "error", code: res.code, details: res.details });
      return;
    }
    setSend({ kind: "error", code: res.code, details: res.details });
  }

  return (
    <>
      <CategoryTabs categories={categories} />
      <MenuList categories={categories} inCart={inCart} onSelect={(p) => { setSelected(p); setDishOpen(true); }} />

      <CartBar
        count={cartCount(lines)}
        total={cartTotal(lines)}
        onOpen={() => {
          setSend((s) => s.kind === "sent" ? { kind: "idle" } : s);
          setCartOpen(true);
        }}
      />

      <DishSheet
        product={selected ? categories.flatMap((c) => c.products).find((p) => p.id === selected.id) ?? selected : null}
        open={dishOpen}
        onClose={() => setDishOpen(false)}
        onAdd={({ product, quantity, note }) => {
          operation.clear();
          setCart((c) => addLine(c, { productId: product.id, name: product.name, unitPrice: product.price, quantity, note }));
          setSelected(null);
          setDishOpen(false);
        }}
      />

      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        token={token}
        lines={lines}
        send={send}
        onSend={handleSend}
        onQuantity={(key, qty) => {
          operation.clear();
          resetSendError();
          setCart((c) => updateQuantity(c, key, qty));
        }}
        onRemove={(key) => {
          operation.clear();
          resetSendError();
          setCart((c) => removeLine(c, key));
        }}
        onNote={(key, note) => {
          operation.clear();
          resetSendError();
          setCart((c) => updateNote(c, key, note));
        }}
      />
    </>
  );
}
