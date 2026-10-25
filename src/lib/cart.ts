// Carrito del cliente: lógica pura (sin React ni localStorage) para poder testearla.
// Los precios aquí son solo una estimación con los precios del menú; el servidor
// recalcula todo al enviar el pedido.

export const MAX_QTY = 20;
export const MAX_NOTE = 200;
export const CART_VERSION = 1;

export type CartLine = {
  key: string; // productId + nota normalizada: mismo plato con otra nota = otra línea
  productId: string;
  name: string;
  unitPrice: number; // centavos (estimado)
  quantity: number;
  note: string;
};

export type Cart = CartLine[];

export type AddInput = { productId: string; name: string; unitPrice: number; quantity: number; note?: string };

export const normalizeNote = (note: string | undefined | null) =>
  (note ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE);

export const lineKey = (productId: string, note: string) => `${productId}::${normalizeNote(note)}`;

export const clampQty = (n: number) => {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_QTY, Math.max(1, Math.round(n)));
};

/** Añade un plato; si ya existe la misma combinación producto + nota, suma la cantidad (tope 20). */
export function addLine(cart: Cart, input: AddInput): Cart {
  const note = normalizeNote(input.note);
  const key = lineKey(input.productId, note);
  const qty = clampQty(input.quantity);
  const existing = cart.find((l) => l.key === key);
  if (existing) {
    return cart.map((l) =>
      l.key === key ? { ...l, quantity: clampQty(l.quantity + qty), unitPrice: input.unitPrice, name: input.name } : l,
    );
  }
  return [...cart, { key, productId: input.productId, name: input.name, unitPrice: input.unitPrice, quantity: qty, note }];
}

/** Cambia la cantidad (1–20). Con 0 o menos elimina la línea. */
export function updateQuantity(cart: Cart, key: string, quantity: number): Cart {
  if (quantity <= 0) return removeLine(cart, key);
  return cart.map((l) => (l.key === key ? { ...l, quantity: clampQty(quantity) } : l));
}

export function removeLine(cart: Cart, key: string): Cart {
  return cart.filter((l) => l.key !== key);
}

/** Cambia la nota; si la nueva combinación ya existe, fusiona ambas líneas. */
export function updateNote(cart: Cart, key: string, note: string): Cart {
  const line = cart.find((l) => l.key === key);
  if (!line) return cart;
  const normalized = normalizeNote(note);
  const newKey = lineKey(line.productId, normalized);
  if (newKey === key) return cart;
  const target = cart.find((l) => l.key === newKey);
  if (target) {
    return cart
      .filter((l) => l.key !== key)
      .map((l) => (l.key === newKey ? { ...l, quantity: clampQty(l.quantity + line.quantity) } : l));
  }
  return cart.map((l) => (l.key === key ? { ...l, key: newKey, note: normalized } : l));
}

export type MenuInfo = { name: string; price: number; available: boolean };

export type CartLineView = CartLine & { unavailable: boolean };

/**
 * Cruza el carrito con el menú actual: refresca nombre y precio estimado y marca como
 * no disponibles los platos agotados, desaparecidos o rechazados por el servidor.
 */
export function reconcile(
  cart: Cart,
  menu: ReadonlyMap<string, MenuInfo>,
  rejected: ReadonlySet<string> = new Set(),
): CartLineView[] {
  return cart.map((l) => {
    const p = menu.get(l.productId);
    return {
      ...l,
      name: p?.name ?? l.name,
      unitPrice: p?.price ?? l.unitPrice,
      unavailable: !p || !p.available || rejected.has(l.productId),
    };
  });
}

const orderable = (lines: readonly (CartLine & { unavailable?: boolean })[]) => lines.filter((l) => !l.unavailable);

/** Número de platos (suma de cantidades) que se van a enviar. */
export const cartCount = (lines: readonly (CartLine & { unavailable?: boolean })[]) =>
  orderable(lines).reduce((n, l) => n + l.quantity, 0);

/** Total estimado en centavos (excluye líneas no disponibles). */
export const cartTotal = (lines: readonly (CartLine & { unavailable?: boolean })[]) =>
  orderable(lines).reduce((n, l) => n + l.unitPrice * l.quantity, 0);

/** Lo que se envía a `submitOrder`: nunca precios. */
export function toSubmitItems(lines: readonly (CartLine & { unavailable?: boolean })[]) {
  return orderable(lines).map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
    ...(l.note ? { notes: l.note } : {}),
  }));
}

/** Añade una sugerencia rápida al final de la nota sin pasar de 200 caracteres. */
export function appendSuggestion(note: string, suggestion: string): string {
  const current = note.trim();
  if (current.toLowerCase().includes(suggestion.toLowerCase())) return note;
  const next = current ? `${current.replace(/[,.]\s*$/, "")}, ${suggestion}` : suggestion;
  return next.length > MAX_NOTE ? note : next;
}

export function serializeCart(cart: Cart): string {
  return JSON.stringify({ v: CART_VERSION, lines: cart });
}

/** Lee un carrito guardado; ante cualquier dato raro devuelve un carrito vacío o descarta la línea. */
export function parseCart(raw: string | null | undefined): Cart {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!data || typeof data !== "object" || (data as { v?: unknown }).v !== CART_VERSION) return [];
  const lines = (data as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return [];
  let cart: Cart = [];
  for (const l of lines) {
    if (!l || typeof l !== "object") continue;
    const { productId, name, unitPrice, quantity, note } = l as Record<string, unknown>;
    if (typeof productId !== "string" || !productId || productId.length > 64) continue;
    if (typeof name !== "string" || typeof unitPrice !== "number" || !Number.isInteger(unitPrice) || unitPrice < 0)
      continue;
    if (typeof quantity !== "number") continue;
    cart = addLine(cart, { productId, name, unitPrice, quantity, note: typeof note === "string" ? note : "" });
  }
  return cart;
}

export const cartStorageKey = (token: string) => `mv:cart:${token}`;
