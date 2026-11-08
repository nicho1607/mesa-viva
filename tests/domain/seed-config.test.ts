import { expect, it } from "vitest";
import { seedConfig } from "../../prisma/seed-config";

it("conserva las credenciales demo en desarrollo", () => {
  expect(seedConfig({})).toEqual({ production: false, adminPassword: "admin123", waiterPassword: "mesero123" });
});

it("impide publicar con contraseñas demo, cortas o compartidas", () => {
  expect(() => seedConfig({ NODE_ENV: "production" })).toThrow(/SEED_ADMIN_PASSWORD/);
  expect(() => seedConfig({ NODE_ENV: "production", SEED_ADMIN_PASSWORD: "otra-clave-larga", SEED_WAITER_PASSWORD: "corta" })).toThrow();
  expect(() => seedConfig({ NODE_ENV: "production", SEED_ADMIN_PASSWORD: "misma-clave-larga", SEED_WAITER_PASSWORD: "misma-clave-larga" })).toThrow();
});

it("acepta contraseñas de producción diferentes y suficientemente largas", () => {
  expect(seedConfig({ NODE_ENV: "production", SEED_ADMIN_PASSWORD: "admin-clave-segura", SEED_WAITER_PASSWORD: "mesero-clave-segura" }).production).toBe(true);
});
