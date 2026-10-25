// Deja la BD E2E como recién sembrada: borra el esquema public, aplica las migraciones y
// ejecuta el seed. Corre como primer paso del `webServer` de Playwright (antes de arrancar
// el servidor: Playwright inicia el webServer ANTES del globalSetup).
// Uso: `npx tsx tests/e2e/support/prepare-db.ts`

import { execSync } from "node:child_process";
import pg from "pg";
import { getE2EDatabaseUrl, withoutSchemaParam } from "./e2e-db";

async function main() {
  const url = getE2EDatabaseUrl();
  const client = new pg.Client({ connectionString: withoutSchemaParam(url) });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }
  // prisma.config.ts lee env("DATABASE_URL"); dotenv no pisa variables ya definidas.
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { stdio: "pipe", env });
  execSync("npx prisma db seed", { stdio: "pipe", env });
  console.log("[e2e] BD E2E reseteada, migrada y sembrada.");
}

main().catch((e) => {
  console.error("[e2e] No se pudo preparar la BD E2E:", e instanceof Error ? e.message : e);
  process.exit(1);
});
