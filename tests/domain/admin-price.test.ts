import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { toFormState } from "@/lib/admin-form";
import { ConflictError } from "@/lib/domain/errors";
import { centsToPesosInput, parsePriceToCents, productInput, tablePublicUrl } from "@/lib/domain/admin";

describe("parsePriceToCents", () => {
  it.each([
    ["28.000", 2_800_000],
    ["28000", 2_800_000],
    ["$ 28.000", 2_800_000],
    [" 12.500 ", 1_250_000],
    ["1.250.000", 125_000_000],
    ["28.000,50", 2_800_050],
    ["28000,5", 2_800_050],
    ["0", 0],
  ])("%s → %d centavos", (input, cents) => {
    expect(parsePriceToCents(input)).toBe(cents);
  });

  it.each(["-28.000", "28.00", "28,000", "28.0000", "abc", "", "1e5", "12.5", "28000.50", "9999999999"])(
    "rechaza %j",
    (input) => {
      expect(parsePriceToCents(input)).toBeNull();
    },
  );

  it("centsToPesosInput es la inversa para la edición", () => {
    for (const c of [1_250_000, 2_800_050, 100, 125_000_000]) {
      expect(parsePriceToCents(centsToPesosInput(c))).toBe(c);
    }
    expect(centsToPesosInput(1_250_000)).toBe("12.500");
  });
});

describe("productInput", () => {
  const base = { name: "Arepa", categoryId: "3f1e1c1a-6d5b-4c3a-9e8f-1a2b3c4d5e6f", sortOrder: "" };

  it("convierte el precio a centavos y el checkbox a booleano", () => {
    const p = productInput.parse({ ...base, price: "12.500", available: "on" });
    expect(p).toMatchObject({ price: 1_250_000, available: true, sortOrder: 0, description: null });
    expect(productInput.parse({ ...base, price: "12.500" }).available).toBe(false);
  });

  it("negativos, cero y formatos raros dan error en el campo price", () => {
    for (const [price, msg] of [
      ["-5.000", "negativo"],
      ["0", "mayor que cero"],
      ["12,5000", "por ejemplo"],
      ["", "por ejemplo"],
    ]) {
      const r = productInput.safeParse({ ...base, price });
      expect(r.success).toBe(false);
      const state = toFormState(r.error);
      expect(state.fieldErrors?.price).toContain(msg);
    }
  });
});

describe("toFormState", () => {
  it("ConflictError con campo → error del campo; nunca devuelve la contraseña", () => {
    const s = toFormState(new ConflictError("Ya existe", "email"), { email: "a@b.co", password: "secreto123" });
    expect(s).toMatchObject({ ok: false, fieldErrors: { email: "Ya existe" }, values: { email: "a@b.co" } });
    expect(s.values).not.toHaveProperty("password");
  });

  it("ZodError → errores por campo", () => {
    const s = toFormState(new ZodError([{ code: "custom", path: ["name"], message: "Escribe el nombre", input: "" }]));
    expect(s.fieldErrors).toEqual({ name: "Escribe el nombre" });
  });
});

it("tablePublicUrl quita barras finales del origen", () => {
  expect(tablePublicUrl("https://mesa.co/", "abc")).toBe("https://mesa.co/m/abc");
});
