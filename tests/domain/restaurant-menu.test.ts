import { describe, expect, it } from "vitest";
import { RESTAURANT_MENU } from "../../prisma/restaurant-menu";

describe("carta del restaurante", () => {
  it("conserva las categorías, precios COP y presentaciones de la carta fotografiada", () => {
    const products = RESTAURANT_MENU.flatMap((category) => category.products);
    expect(RESTAURANT_MENU).toHaveLength(11);
    expect(products).toHaveLength(59);
    expect(new Set(products.map((p) => p.name)).size).toBe(products.length);
    for (const product of products) {
      expect(Number.isSafeInteger(product.price)).toBe(true);
      expect(product.price).toBeGreaterThan(0);
    }
    const prices = Object.fromEntries(products.map((p) => [p.name, p.price]));
    expect(prices["Bandeja paisa"]).toBe(4000000);
    expect(prices["Limonada de coco"]).toBe(950000);
    expect(prices["Cañón a la parrilla"]).toBe(3500000);
    expect(prices["Cañón en salsa de champiñones"]).toBe(4000000);
    expect(prices["Empanaditas con ají · 4 personas"]).toBe(1000000);
    expect(prices["Claro"]).toBe(450000);
  });
});
