import { describe, expect, it } from "vitest";
import {
  addLine,
  appendSuggestion,
  cartCount,
  cartTotal,
  parseCart,
  reconcile,
  removeLine,
  serializeCart,
  toSubmitItems,
  updateNote,
  updateQuantity,
  type Cart,
} from "@/lib/cart";

const sopa = { productId: "p1", name: "Sopa", unitPrice: 1500000 };
const jugo = { productId: "p2", name: "Jugo", unitPrice: 800000 };

describe("cart", () => {
  it("fusiona líneas con el mismo producto y nota", () => {
    let c: Cart = addLine([], { ...sopa, quantity: 1, note: "Sin cebolla" });
    c = addLine(c, { ...sopa, quantity: 2, note: "  Sin   cebolla " });
    expect(c).toHaveLength(1);
    expect(c[0].quantity).toBe(3);
    expect(c[0].note).toBe("Sin cebolla");
  });

  it("mismo producto con otra nota es otra línea", () => {
    let c: Cart = addLine([], { ...sopa, quantity: 1 });
    c = addLine(c, { ...sopa, quantity: 1, note: "Salsa aparte" });
    expect(c).toHaveLength(2);
  });

  it("limita la cantidad a 1–20", () => {
    let c: Cart = addLine([], { ...sopa, quantity: 15 });
    c = addLine(c, { ...sopa, quantity: 15 });
    expect(c[0].quantity).toBe(20);
    c = updateQuantity(c, c[0].key, 50);
    expect(c[0].quantity).toBe(20);
    c = updateQuantity(c, c[0].key, 0);
    expect(c).toHaveLength(0);
  });

  it("recorta notas a 200 caracteres", () => {
    const c = addLine([], { ...sopa, quantity: 1, note: "x".repeat(300) });
    expect(c[0].note).toHaveLength(200);
  });

  it("quita líneas", () => {
    let c: Cart = addLine([], { ...sopa, quantity: 1 });
    c = addLine(c, { ...jugo, quantity: 1 });
    c = removeLine(c, c[0].key);
    expect(c.map((l) => l.productId)).toEqual(["p2"]);
  });

  it("editar la nota fusiona si ya existe la combinación", () => {
    let c: Cart = addLine([], { ...sopa, quantity: 1, note: "Sin cebolla" });
    c = addLine(c, { ...sopa, quantity: 2 });
    c = updateNote(c, c[1].key, " Sin cebolla ");
    expect(c).toHaveLength(1);
    expect(c[0].quantity).toBe(3);
    const single = updateNote(addLine([], { ...jugo, quantity: 1 }), "p2::", "Sin hielo");
    expect(single[0]).toMatchObject({ key: "p2::Sin hielo", note: "Sin hielo" });
  });

  it("totales y conteo excluyen líneas no disponibles", () => {
    let c: Cart = addLine([], { ...sopa, quantity: 2 });
    c = addLine(c, { ...jugo, quantity: 1 });
    expect(cartCount(c)).toBe(3);
    expect(cartTotal(c)).toBe(3800000);
    const menu = new Map([
      ["p1", { name: "Sopa de tortilla", price: 1600000, available: true }],
      ["p2", { name: "Jugo", price: 800000, available: true }],
    ]);
    const view = reconcile(c, menu, new Set(["p2"]));
    expect(view[0]).toMatchObject({ name: "Sopa de tortilla", unitPrice: 1600000, unavailable: false });
    expect(view[1].unavailable).toBe(true);
    expect(cartCount(view)).toBe(2);
    expect(cartTotal(view)).toBe(3200000);
    expect(toSubmitItems(view)).toEqual([{ productId: "p1", quantity: 2 }]);
  });

  it("reconcile marca agotados y productos que ya no existen", () => {
    const c = addLine(addLine([], { ...sopa, quantity: 1 }), { ...jugo, quantity: 1 });
    const view = reconcile(c, new Map([["p1", { name: "Sopa", price: 1500000, available: false }]]));
    expect(view.map((l) => l.unavailable)).toEqual([true, true]);
  });

  it("toSubmitItems nunca envía precios y omite notas vacías", () => {
    const c = addLine(addLine([], { ...sopa, quantity: 1, note: "Término medio" }), { ...jugo, quantity: 2 });
    expect(toSubmitItems(c)).toEqual([
      { productId: "p1", quantity: 1, notes: "Término medio" },
      { productId: "p2", quantity: 2 },
    ]);
  });

  it("serializa y vuelve a leer el carrito", () => {
    const c = addLine(addLine([], { ...sopa, quantity: 2, note: "Sin cebolla" }), { ...jugo, quantity: 1 });
    expect(parseCart(serializeCart(c))).toEqual(c);
  });

  it("parseCart tolera datos corruptos", () => {
    expect(parseCart(null)).toEqual([]);
    expect(parseCart("{no json")).toEqual([]);
    expect(parseCart(JSON.stringify({ v: 99, lines: [] }))).toEqual([]);
    const mixed = JSON.stringify({
      v: 1,
      lines: [
        { productId: "p1", name: "Sopa", unitPrice: 100, quantity: 99, note: "a" },
        { productId: 5, name: "x", unitPrice: 1, quantity: 1 },
        { productId: "p2", name: "Jugo", unitPrice: 1.5, quantity: 1 },
        null,
      ],
    });
    const c = parseCart(mixed);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ productId: "p1", quantity: 20, note: "a" });
  });

  it("appendSuggestion añade al final sin repetir ni pasar de 200", () => {
    expect(appendSuggestion("", "Sin cebolla")).toBe("Sin cebolla");
    expect(appendSuggestion("Bien caliente.", "Salsa aparte")).toBe("Bien caliente, Salsa aparte");
    expect(appendSuggestion("sin cebolla", "Sin cebolla")).toBe("sin cebolla");
    const long = "x".repeat(195);
    expect(appendSuggestion(long, "Término medio")).toBe(long);
  });
});
