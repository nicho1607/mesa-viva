import { afterEach, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "../integration/test-db-url";

afterEach(() => vi.unstubAllEnvs());

it("rechaza la misma base aunque cambien usuario, puerto explícito o parámetros", () => {
  vi.stubEnv("MESA_VIVA_TEST_DB", "0");
  vi.stubEnv("DATABASE_URL", "postgresql://dev:pw@localhost/app?schema=public");
  vi.stubEnv("TEST_DATABASE_URL", "postgresql://test:pw@LOCALHOST:5432/app");
  expect(getTestDatabaseUrl).toThrow(/no puede ser igual/);
});

it("acepta una base separada", () => {
  vi.stubEnv("MESA_VIVA_TEST_DB", "0");
  vi.stubEnv("DATABASE_URL", "postgresql://dev:pw@localhost/app");
  vi.stubEnv("TEST_DATABASE_URL", "postgresql://dev:pw@localhost/app_test");
  expect(getTestDatabaseUrl()).toBe(process.env.TEST_DATABASE_URL);
});
