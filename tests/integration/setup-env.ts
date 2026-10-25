// Corre en cada worker antes de importar los tests: `@/lib/db` lee DATABASE_URL al crearse.
import { getTestDatabaseUrl } from "./test-db-url";

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.MESA_VIVA_TEST_DB = "1";
