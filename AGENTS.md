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
