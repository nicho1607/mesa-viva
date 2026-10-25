import { config } from "dotenv";

/** URL de la BD de test (TEST_DATABASE_URL); nunca la de desarrollo. */
export function getTestDatabaseUrl(): string {
  config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("Falta TEST_DATABASE_URL en .env (BD separada para tests de integración; ver AGENTS.md).");
  }
  if (process.env.DATABASE_URL === url && process.env.MESA_VIVA_TEST_DB !== "1") {
    throw new Error("TEST_DATABASE_URL no puede ser igual a DATABASE_URL (la BD de desarrollo).");
  }
  return url;
}
