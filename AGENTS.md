<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Mesa Viva — convenciones del proyecto

Arquitectura completa: `docs/ARQUITECTURA.md`. Historias: `claude-loop/prd.json`.

## Stack real (más nuevo que lo que dice la doc)
- **Next.js 16** (App Router, Turbopack), React 19, TypeScript strict, Tailwind v4, alias `@/*` → `src/*`.
- `cacheComponents` está **desactivado** a propósito (modelo de caché clásico). Páginas que lean BD sin usar `cookies()`/`headers()` deben forzar render dinámico (`await connection()` de `next/server`).
- En Next 16 `middleware.ts` se llama **`src/proxy.ts`** (export `proxy`). La doc dice `middleware.ts`: usa `proxy.ts`.
- `LayoutProps` / `PageProps` son tipos globales generados por `next typegen` (el script `typecheck` lo ejecuta).
- **Prisma 7**: config en `prisma.config.ts` (lee `.env` con dotenv), cliente con `@prisma/adapter-pg`.
- Zod 4, jose 6, bcryptjs 3 (trae sus tipos), TanStack Query 5, Vitest 5, Playwright.

## Base de datos (Prisma 7)
- Generador `prisma-client` → `src/generated/prisma` (gitignored; lo regenera `postinstall` / `npm run db:generate`). Tras tocar el schema: `npx prisma generate` (en v7 `migrate dev` **no** genera ni ejecuta el seed).
- Importar el cliente siempre como `import { db } from "@/lib/db"` (singleton en globalThis con `PrismaPg`). Tipos/enums desde `@/generated/prisma/client` (p.ej. `Role`, `OrderStatus`).
- `schema.prisma` no lleva `url`: la conexión está en `prisma.config.ts`.
- El índice único parcial `one_open_order_per_table` vive solo en el SQL de la migración inicial; Prisma no lo conoce. Al abrir una orden, tratar el error de unicidad (P2002) como "ya hay una orden abierta". SQL a mano: `prisma migrate dev --create-only`, editar `migration.sql`, luego `prisma migrate dev`.
- `npm run db:migrate` · `npm run db:seed` (tsx, idempotente) · `npm run db:reset`. Credenciales demo en `README.md`.
- `Setting` guarda strings: `taxRate` 0.19, `pricesIncludeTax` true, `tipRate` 0.10, `currency` COP, `restaurantName`.

## Reglas de dominio
- **Dinero siempre en centavos enteros** (`Int`). Nunca floats; formatear solo en UI con `formatMoney` (`src/lib/money.ts`).
- **El servidor calcula todos los precios** desde `Product`. El cliente solo envía `productId`, `quantity`, `notes`.
- Lógica de negocio en **`src/lib/domain`**: pura donde se pueda y con tests Vitest en `tests/domain`.
- **Server Actions** (`src/app/actions`) son capas delgadas: validan con Zod, autorizan, llaman a `lib/domain`.
- Orden cerrada = inmutable (rechazar si `status != OPEN`).
- **Tiempo real = "señal + refetch"**: tras el commit, `pg_notify('mesa_viva', …)` → SSE (`/api/events`) → el cliente invalida su query y vuelve a pedir. Los payloads llevan solo `{ type, orderId, version }`, **nunca precios** ni datos de otras mesas.

## UI
- Todo el texto visible **en español**.
- Tokens de color (`bg-plato`, `text-tinta`, `text-tinta-suave`, `azafran`, `albahaca`, `guindilla`) y fuentes (`font-display` = Bricolage Grotesque, `font-sans` = Atkinson Hyperlegible) definidos en `src/app/globals.css` vía `@theme`; ver sección 6 de la doc.
- Contraste AA, foco visible, objetivos táctiles ≥ 44 px (`min-h-11`), respetar `prefers-reduced-motion`.

## Comandos
- `npm run dev` · `npm run build` · `npm run lint`
- `npm run typecheck` (next typegen + tsc --noEmit) · `npm test` (vitest run) · `npm run test:e2e` (Playwright)
- `.env` (no se commitea) con `DATABASE_URL` y `SESSION_SECRET`; plantilla en `.env.example`.
