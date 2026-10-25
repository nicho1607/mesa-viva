// BD de las pruebas E2E: URL con salvaguardas + acceso directo con `pg` para los asserts.
// Nunca apunta a la BD de desarrollo (DATABASE_URL) ni a la de integración (TEST_DATABASE_URL).

import { config } from "dotenv";
import pg from "pg";

/** host:puerto/basededatos, para comparar URLs aunque cambie el usuario o los parámetros. */
function dbIdentity(url: string): string {
  const u = new URL(url);
  return `${u.hostname.toLowerCase()}:${u.port || "5432"}/${decodeURIComponent(u.pathname.replace(/^\//, ""))}`;
}

/** Quita `?schema=…` (lo usa Prisma; node-pg y psql no lo entienden). */
export function withoutSchemaParam(url: string): string {
  const u = new URL(url);
  u.searchParams.delete("schema");
  return u.toString();
}

/** URL de la BD E2E (E2E_DATABASE_URL). Lanza si falta o si coincide con la de dev o la de test. */
export function getE2EDatabaseUrl(): string {
  config({ quiet: true });
  const url = process.env.E2E_DATABASE_URL;
  if (!url) {
    throw new Error("Falta E2E_DATABASE_URL en .env (BD separada para las pruebas E2E; ver AGENTS.md).");
  }
  const id = dbIdentity(url);
  // Leer .env sin pisar process.env: el servidor E2E corre con DATABASE_URL = E2E_DATABASE_URL.
  const fileEnv = config({ quiet: true, processEnv: {} }).parsed ?? {};
  const forbidden: [string, string | undefined][] = [
    ["DATABASE_URL", fileEnv.DATABASE_URL],
    ["TEST_DATABASE_URL", fileEnv.TEST_DATABASE_URL],
    ["TEST_DATABASE_URL", process.env.TEST_DATABASE_URL],
  ];
  for (const [name, other] of forbidden) {
    if (other && dbIdentity(other) === id) {
      throw new Error(`E2E_DATABASE_URL no puede apuntar a la misma BD que ${name}: las pruebas E2E la borran.`);
    }
  }
  return url;
}

let pool: pg.Pool | null = null;

/** Consulta la BD E2E (pool perezoso por proceso de Playwright). */
export async function e2eQuery<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  pool ??= new pg.Pool({ connectionString: withoutSchemaParam(getE2EDatabaseUrl()), max: 2 });
  const r = await pool.query<T>(sql, params);
  return r.rows;
}

export async function closeE2EPool(): Promise<void> {
  await pool?.end();
  pool = null;
}

export type SeedTable = { id: string; number: number; publicToken: string };

export async function getTable(number: number): Promise<SeedTable> {
  const rows = await e2eQuery<SeedTable>(`SELECT id, number, "publicToken" FROM "Table" WHERE number = $1`, [number]);
  if (!rows[0]) throw new Error(`La mesa ${number} no existe en la BD E2E (¿se ejecutó el seed?).`);
  return rows[0];
}

/** Precio (centavos) de un producto del seed por nombre. */
export async function getProductPrice(name: string): Promise<number> {
  const rows = await e2eQuery<{ price: number }>(`SELECT price FROM "Product" WHERE name = $1`, [name]);
  if (!rows[0]) throw new Error(`El producto "${name}" no existe en la BD E2E.`);
  return rows[0].price;
}

export async function getSetting(key: string): Promise<string> {
  const rows = await e2eQuery<{ value: string }>(`SELECT value FROM "Setting" WHERE key = $1`, [key]);
  if (!rows[0]) throw new Error(`Falta el Setting "${key}" en la BD E2E.`);
  return rows[0].value;
}
