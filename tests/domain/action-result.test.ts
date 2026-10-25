import { afterEach, describe, expect, it, vi } from "vitest";
import { GENERIC_ERROR, toActionError } from "@/lib/action-result";
import { InvalidTableError, OrderClosedError, UnavailableProductsError } from "@/lib/domain/errors";
import { z } from "zod";
import { RateLimitError } from "@/lib/rate-limit";

// Mismo esquema que `addItemsInput` de @/lib/domain/orders (ese módulo importa la BD).
const addItemsInput = z.object({
  token: z.string().min(16).max(64),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().min(1).max(20),
        notes: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(30),
});

function zodError(input: unknown) {
  const r = addItemsInput.safeParse(input);
  if (r.success) throw new Error("se esperaba error de validación");
  return r.error;
}

const token = "x".repeat(20);
const productId = "6f1c3e1a-8b7d-4c2e-9f3a-1b2c3d4e5f60";

afterEach(() => vi.restoreAllMocks());

describe("toActionError", () => {
  it("DomainError → su mensaje y código", () => {
    expect(toActionError(new OrderClosedError())).toEqual({
      ok: false,
      error: new OrderClosedError().message,
      code: "ORDER_CLOSED",
    });
    expect(toActionError(new InvalidTableError())).toMatchObject({ ok: false, code: "INVALID_TABLE" });
  });

  it("UnavailableProductsError incluye los productIds en details", () => {
    expect(toActionError(new UnavailableProductsError(["p1", "p2"]))).toEqual({
      ok: false,
      error: "Algunos productos ya no están disponibles",
      code: "UNAVAILABLE_PRODUCTS",
      details: { productIds: ["p1", "p2"] },
    });
  });

  it("RateLimitError → mensaje de espera", () => {
    expect(toActionError(new RateLimitError(5_000))).toEqual({
      ok: false,
      error: "Estás enviando pedidos muy rápido. Espera un momento.",
      code: "RATE_LIMITED",
    });
  });

  it("ZodError → 'Revisa tu pedido: …' con código VALIDATION en español", () => {
    const r = toActionError(zodError({ token, items: [{ productId, quantity: 0 }] }));
    expect(r).toEqual({
      ok: false,
      error: "Revisa tu pedido: la cantidad de cada producto debe estar entre 1 y 20.",
      code: "VALIDATION",
    });
    expect(toActionError(zodError({ token, items: [] })).error).toBe("Revisa tu pedido: agrega al menos un producto.");
    expect(toActionError(zodError({ token, items: [{ productId, quantity: 1, notes: "a".repeat(201) }] })).error).toContain(
      "200 caracteres",
    );
    expect(toActionError(zodError({ token: "corto", items: [{ productId: "no-uuid", quantity: 1 }] })).error).toBe(
      "Revisa tu pedido: el código de la mesa no es válido; hay un producto no válido.",
    );
  });

  it("desconocido → mensaje genérico, código INTERNAL y se registra", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = toActionError(new Error("boom: detalles internos"));
    expect(r).toEqual({ ok: false, error: GENERIC_ERROR, code: "INTERNAL" });
    expect(r.error).not.toContain("boom");
    expect(spy).toHaveBeenCalledOnce();
  });
});
