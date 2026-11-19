import { describe, expect, it } from "vitest";
import drafts from "../../docs/translations/menu.en.draft.json";
import { withBillDrafts, withMenuDrafts } from "@/lib/i18n/menu-preview";
import type { MenuCategory, TableBillView } from "@/lib/domain/queries";
import { addLine, reconcile, toSubmitItems } from "@/lib/cart";

const local = { NODE_ENV: "development", CUSTOMER_ENGLISH_PREVIEW: "true" } as const;
const menu: MenuCategory[] = [{
  id: "category", name: "Entradas", nameEn: null,
  products: [{ id: "dish", name: drafts.products[0].sourceName, description: drafts.products[0].sourceDescription,
    nameEn: null, descriptionEn: null, price: 1200000, imageUrl: null, available: false }],
}];

describe("catálogo publicado con revisión pendiente", () => {
  it("traduce los 19 platos y 4 categorías sin modificar los originales", () => {
    const original = structuredClone(menu);
    const preview = withMenuDrafts(menu, local);
    expect(preview[0].nameEn).toBe("Starters");
    expect(preview[0].products[0]).toEqual({ ...menu[0].products[0], nameEn: drafts.products[0].nameEn, descriptionEn: drafts.products[0].descriptionEn });
    expect(menu).toEqual(original);
    expect(drafts.products).toHaveLength(19);
    expect(drafts.categories).toHaveLength(4);
    for (const entry of drafts.products) {
      const source = [{ ...menu[0], products: [{ ...menu[0].products[0], name: entry.sourceName, description: entry.sourceDescription }] }];
      expect(withMenuDrafts(source, local)[0].products[0]).toMatchObject({ nameEn: entry.nameEn, descriptionEn: entry.descriptionEn });
      expect(entry.status).toBe("pending");
      expect(entry.reviewedBy).toBeNull();
    }
    for (const entry of drafts.categories) {
      expect(withMenuDrafts([{ ...menu[0], name: entry.source }], local)[0].nameEn).toBe(entry.nameEn);
    }
    expect(drafts.status).toBe("DRAFT_NOT_REVIEWED");
  });

  it("muestra el catálogo publicado en producción sin exigir la variable de vista previa", () => {
    for (const env of [
      { NODE_ENV: "production", CUSTOMER_ENGLISH_PREVIEW: "true" },
      { NODE_ENV: "production" },
      { NODE_ENV: "test", CUSTOMER_ENGLISH_PREVIEW: "true" },
      { NODE_ENV: "development" },
      { NODE_ENV: "development", CUSTOMER_ENGLISH_PREVIEW: "false" },
    ] as const) expect(withMenuDrafts(menu, env)[0].nameEn).toBe("Starters");
  });

  it("respeta traducciones aprobadas y descarta descripciones cuyo original cambió", () => {
    const approved = [{ ...menu[0], nameEn: "Reviewed category", products: [{ ...menu[0].products[0], nameEn: "Reviewed dish", descriptionEn: "Reviewed description" }] }];
    expect(withMenuDrafts(approved, local)).toEqual(approved);
    const changed = [{ ...menu[0], products: [{ ...menu[0].products[0], description: "Nueva receta" }] }];
    expect(withMenuDrafts(changed, local)[0].products[0].descriptionEn).toBeNull();
    const unknown = [{ ...menu[0], name: "Nueva categoría", products: [{ ...menu[0].products[0], name: "Nuevo plato" }] }];
    expect(withMenuDrafts(unknown, local)).toEqual(unknown);
  });
});

describe("pedido y cuenta con borradores locales", () => {
  const item = { id: "item", productName: "Patacones con hogao", productNameEn: null, unitPrice: 1400000, quantity: 2, notes: "Sin cebolla", status: "PENDING" } as const;
  const bill: TableBillView = {
    table: { number: 1 }, currency: "COP",
    order: { id: "order", status: "OPEN", version: 1, rounds: [{ round: 1, items: [item] }] },
    totals: { subtotal: 2800000, taxAmount: 447059, tipAmount: 280000, total: 3080000, taxRate: 0.19, tipRate: 0.1, pricesIncludeTax: true },
    paymentMethod: null, cashAmount: null, transferAmount: null, customerStatus: "IN_PREPARATION",
  };

  it("el carrito muestra el borrador sin incluir traducciones en el envío", () => {
    const product = { ...menu[0].products[0], name: "Patacones con hogao", description: drafts.products[1].sourceDescription };
    const preview = withMenuDrafts([{ ...menu[0], products: [product] }], local)[0].products[0];
    const cart = addLine([], { productId: product.id, name: product.name, unitPrice: product.price, quantity: 2, note: item.notes });
    const before = structuredClone(cart);
    const lines = reconcile(cart, new Map([[product.id, { ...preview, available: true }]]));
    expect(lines[0].nameEn).toBe("Patacones — fried plantains with hogao sauce");
    expect(cart).toEqual(before);
    expect(toSubmitItems(lines)).toEqual([{ productId: product.id, quantity: 2, notes: "Sin cebolla" }]);
  });

  it("superpone nombres en cuentas abiertas y cerradas sin mutar los históricos ni totales", () => {
    for (const status of ["OPEN", "CLOSED"] as const) {
      if (!bill.order) throw new Error("fixture sin orden");
      const source = { ...bill, order: { ...bill.order, status } };
      const original = structuredClone(source);
      const preview = withBillDrafts(source, local);
      if (!preview.order) throw new Error("vista previa sin orden");
      expect(preview.order?.rounds[0].items[0]).toEqual({ ...item, productNameEn: "Patacones — fried plantains with hogao sauce" });
      expect(preview.totals).toEqual(source.totals);
      expect(source).toEqual(original);
    }
  });

  it("respeta el snapshot aprobado y no inventa traducciones para nombres históricos distintos", () => {
    if (!bill.order) throw new Error("fixture sin orden");
    const source = { ...bill, order: { ...bill.order, rounds: [{ round: 1, items: [
      { ...item, productNameEn: "Reviewed historical name" },
      { ...item, id: "old", productName: "Patacones receta anterior" },
    ] }] } };
    const items = withBillDrafts(source, local).order?.rounds[0].items;
    expect(items?.[0].productNameEn).toBe("Reviewed historical name");
    expect(items?.[1].productNameEn).toBeNull();
  });

  it("conserva cuentas vacías y muestra el catálogo publicado en producción", () => {
    const empty: TableBillView = { table: { number: 1 }, currency: "COP", order: null };
    expect(withBillDrafts(empty, local)).toBe(empty);
    for (const env of [
      { NODE_ENV: "production", CUSTOMER_ENGLISH_PREVIEW: "true" },
      { NODE_ENV: "production" },
      { NODE_ENV: "test", CUSTOMER_ENGLISH_PREVIEW: "true" },
      { NODE_ENV: "development" },
    ] as const) expect(withBillDrafts(bill, env).order?.rounds[0].items[0].productNameEn).toBe("Patacones — fried plantains with hogao sauce");
  });
});
