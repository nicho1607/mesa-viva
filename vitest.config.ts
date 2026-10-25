import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Dos proyectos:
// - unit: lógica pura, sin BD (tests/domain, src/**).
// - integration: contra la BD de test (TEST_DATABASE_URL), migrada en globalSetup,
//   archivos en serie para que no se pisen los fixtures.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/domain/**/*.test.ts", "src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup-env.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
