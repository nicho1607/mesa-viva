// Comprueba que la BD E2E quedó sembrada (el reset lo hace prepare-db.ts en el webServer).
import { closeE2EPool, e2eQuery, getE2EDatabaseUrl } from "./e2e-db";

export default async function globalSetup() {
  getE2EDatabaseUrl(); // vuelve a aplicar las salvaguardas
  try {
    const [{ tables, open }] = await e2eQuery<{ tables: number; open: number }>(
      `SELECT (SELECT count(*)::int FROM "Table") AS tables,
              (SELECT count(*)::int FROM "Order" WHERE status = 'OPEN') AS open`,
    );
    if (tables !== 8 || open !== 0) {
      throw new Error(`La BD E2E no está recién sembrada (mesas=${tables}, órdenes abiertas=${open}).`);
    }
  } finally {
    await closeE2EPool();
  }
}
