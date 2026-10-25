import { defineConfig } from "@playwright/test";
import { getE2EDatabaseUrl } from "./tests/e2e/support/e2e-db";

// Pruebas E2E contra un `next start` (modo producción = SSE real) sobre la BD E2E.
// - La URL se valida aquí: nunca la de desarrollo ni la de integración.
// - El webServer primero resetea y siembra la BD E2E (Playwright arranca el webServer
//   antes del globalSetup), luego compila y arranca en un puerto propio.
// - Navegador: Microsoft Edge instalado (canal "msedge", Chromium); sin descargas de Playwright.
//   Otro canal: E2E_BROWSER_CHANNEL=chrome npm run test:e2e
const E2E_DATABASE_URL = getE2EDatabaseUrl();
const PORT = Number(process.env.E2E_PORT ?? 3300);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  // Las pruebas comparten una BD: en serie y sin reintentos (un fallo es un fallo).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: "test-results",
  globalSetup: "./tests/e2e/support/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    channel: process.env.E2E_BROWSER_CHANNEL ?? "msedge",
    locale: "es-CO",
    timezoneId: "America/Bogota",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx tsx tests/e2e/support/prepare-db.ts && npm run build && npm run start -- -p ${PORT}`,
    url: `${BASE_URL}/staff/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      PUBLIC_BASE_URL: BASE_URL,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
