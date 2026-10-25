// Aplica las migraciones a la BD de test una vez por ejecución de vitest.
import { execSync } from "node:child_process";
import { getTestDatabaseUrl } from "./test-db-url";

export default function setup() {
  const url = getTestDatabaseUrl();
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
}
