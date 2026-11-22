import { describe, expect, it } from "vitest";
import { z } from "zod";
import { es, en, type MessageKey } from "@/lib/i18n/messages";
import { customerError, customerMoney, englishEnabled, ENGLISH_RELEASED, ENGLISH_REVIEWED, localizedText, normalizeLocale, NOTE_OPTIONS, translate } from "@/lib/i18n";
import { reviewedTranslation } from "@/lib/i18n/review";
import { addLine, appendSuggestion, reconcile, serializeCart, toSubmitItems } from "@/lib/cart";
import { toActionError } from "@/lib/action-result";

describe("idiomas del cliente", () => {
  it("solo admite es/en y publica inglés sin atribuirle revisión humana", () => {
    for (const value of [undefined, null, "EN", "fr", "en<script>"]) expect(normalizeLocale(value)).toBe("es");
    expect(normalizeLocale("en")).toBe("en");
    expect(ENGLISH_RELEASED).toBe(true);
    expect(ENGLISH_REVIEWED).toBe(false);
    expect(englishEnabled(true, false)).toBe(true);
    expect(englishEnabled(false, false)).toBe(true);
    expect(englishEnabled(true, true)).toBe(true);
  });

  it("todos los mensajes conservan claves y parámetros en ambos idiomas", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    for (const key of Object.keys(es) as MessageKey[]) {
      const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(params(en[key]), key).toEqual(params(es[key]));
      if (key !== "noteHelp") expect(en[key].trim(), key).not.toBe("");
    }
    expect(translate("en", "pendingOne", { count: 1 })).toBe("1 dish to send");
    expect(translate("en", "pendingMany", { count: 2 })).toBe("2 dishes to send");
    expect(translate("en", "quantity", { name: "<plato>" })).toBe("Quantity of <plato>");
  });

  it("identifica originales y no inventa traducciones faltantes", () => {
    expect(localizedText("en", "Ajiaco", null)).toEqual({ text: "Ajiaco", original: true });
    expect(localizedText("es", "Ajiaco", "Chicken soup")).toEqual({ text: "Ajiaco", original: false });
    expect(localizedText("en", "Ajiaco", "Chicken soup")).toEqual({ text: "Chicken soup", original: false });
  });

  it("resuelve códigos sin interpretar mensajes y valida por campo", () => {
    expect(customerError("en", { code: "UNKNOWN" })).toBe(en.internal);
    expect(customerError("en", { code: "toString" })).toBe(en.internal);
    expect(customerError("en", { code: "__proto__" })).toBe(en.internal);
    expect(customerError("en", { code: "ORDER_CLOSED" })).toBe(en.orderClosed);
    expect(customerError("en", { code: "CALL_RATE_LIMITED" })).toBe(en.callRateLimit);
    expect(customerError("es", {
      code: "INSUFFICIENT_STOCK",
      details: { shortages: [{ productId: "p", requested: 3, available: 2 }] },
    }, () => "Ajiaco")).toBe("Solo quedan 2 porciones de Ajiaco. Cambia la cantidad y vuelve a enviar el pedido.");
    expect(customerError("en", {
      code: "INSUFFICIENT_STOCK",
      details: { shortages: [{ productId: "p", requested: 1, available: 0 }] },
    }, () => "Ajiaco soup")).toBe("Ajiaco soup is sold out. Remove it from your order to continue.");
    const result = z.object({ items: z.array(z.object({ quantity: z.number().min(1) })) }).safeParse({ items: [{ quantity: 0 }] });
    if (result.success) throw new Error("se esperaba error");
    const error = toActionError(result.error);
    expect(customerError("en", error)).toBe("Check your order: each product quantity must be between 1 and 20.");
    expect(error.error).toContain("entre 1 y 20");
    expect(customerError("en", { code: "VALIDATION" })).toBe("Check your order: some information is invalid.");
  });

  it("conserva carrito, notas, claves y centavos al cambiar presentación", () => {
    const note = appendSuggestion("No ice", NOTE_OPTIONS[0].value);
    expect(note).toBe("No ice, Sin cebolla");
    expect(translate("en", NOTE_OPTIONS[0].key)).toBe("No onion");
    const cart = addLine([], { productId: "p", name: "Plato", unitPrice: 1250000, quantity: 2, note });
    const stored = serializeCart(cart);
    const lines = reconcile(cart, new Map([["p", { name: "Plato", nameEn: "Dish", price: 1250000, available: true }]]));
    for (const locale of ["en", "es", "en"] as const) {
      localizedText(locale, lines[0].name, lines[0].nameEn);
      customerMoney(lines[0].unitPrice, locale);
    }
    expect(serializeCart(cart)).toBe(stored);
    expect(lines[0].key).toBe(cart[0].key);
    expect(toSubmitItems(lines)).toEqual([{ productId: "p", quantity: 2, notes: note }]);
    expect(customerMoney(1250000, "en").replace(/\s/g, " ")).toBe("COP 12,500");
    expect(customerMoney(1250050, "es")).toContain("12.501");
  });
});

describe("revisión del menú", () => {
  const previous = { original: "Sopa", english: "Soup" };
  it("descarta nuevas traducciones no revisadas", () => {
    expect(reviewedTranslation("Sopa", "Soup", false)).toBeNull();
    expect(reviewedTranslation("Sopa", "Soup", true)).toBe("Soup");
  });
  it("invalida por cambio del original o de traducción y permite reaprobación", () => {
    expect(reviewedTranslation("Sopa", undefined, false, previous)).toBe("Soup");
    expect(reviewedTranslation("Caldo", undefined, false, previous)).toBeNull();
    expect(reviewedTranslation("Sopa", "Broth", false, previous)).toBeNull();
    expect(reviewedTranslation("Caldo", "Broth", true, previous)).toBe("Broth");
    expect(reviewedTranslation(null, "Soup", true, previous)).toBeNull();
    expect(reviewedTranslation("Sopa", null, false, previous)).toBeNull();
  });
});
