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

type Props = { token: string; categories: MenuCategory[] };

export function CustomerMenu({ token, categories }: Props) {
  const router = useRouter();
  const [cart, setCart] = useCart(token);
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [send, setSend] = useState<SendState>({ kind: "idle" });
  // Productos que el servidor rechazó como no disponibles en el último envío.
  const [rejected, setRejected] = useState<ReadonlySet<string>>(new Set());

  const menu = useMemo(() => {
    const m = new Map<string, MenuInfo>();
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
    let res: Awaited<ReturnType<typeof submitOrder>>;
    try {
      res = await submitOrder(token, items);
    } catch {
      setSend({ kind: "error", message: "No hay conexión. Revisa tu internet e inténtalo de nuevo." });
      return;
    }
    if (res.ok) {
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
        message: "Algunos platos ya no están disponibles. Quítalos o envía el resto del pedido.",
      });
      return;
    }
    setSend({ kind: "error", message: res.error });
  }

  return (
    <>
      <CategoryTabs categories={categories} />
      <MenuList categories={categories} inCart={inCart} onSelect={setSelected} />

      <CartBar
        count={cartCount(lines)}
        total={cartTotal(lines)}
        onOpen={() => {
          setSend({ kind: "idle" });
          setCartOpen(true);
        }}
      />

      <DishSheet
        product={selected}
        onClose={() => setSelected(null)}
        onAdd={({ product, quantity, note }) => {
          setCart((c) => addLine(c, { productId: product.id, name: product.name, unitPrice: product.price, quantity, note }));
          setSelected(null);
        }}
      />

      <CartSheet
        open={cartOpen}
        onClose={() => {
          setCartOpen(false);
          if (send.kind === "sent") setSend({ kind: "idle" });
        }}
        token={token}
        lines={lines}
        send={send}
        onSend={handleSend}
        onQuantity={(key, qty) => {
          resetSendError();
          setCart((c) => updateQuantity(c, key, qty));
        }}
        onRemove={(key) => {
          resetSendError();
          setCart((c) => removeLine(c, key));
        }}
        onNote={(key, note) => setCart((c) => updateNote(c, key, note))}
      />
    </>
  );
}
