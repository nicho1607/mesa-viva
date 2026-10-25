# Mesa Viva

Pedidos desde la mesa por QR para restaurantes: el cliente pide desde su móvil y el mesero lo recibe en tiempo real.

- Arquitectura: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- Convenciones para agentes/desarrollo: [`AGENTS.md`](AGENTS.md)

## Puesta en marcha

Requisitos: Node 22+, PostgreSQL local.

```bash
cp .env.example .env          # ajusta DATABASE_URL y SESSION_SECRET
npm install                   # ejecuta prisma generate (postinstall)
npm run db:migrate            # aplica migraciones (prisma migrate dev)
npm run db:seed               # carga menú, mesas, usuarios y settings (idempotente)
npm run dev
```

## Credenciales demo (solo desarrollo)

| Rol    | Email                | Contraseña  | Zona            |
|--------|----------------------|-------------|-----------------|
| Admin  | admin@mesaviva.co    | `admin123`  | —               |
| Mesero | laura@mesaviva.co    | `mesero123` | Salón principal (mesas 1–4) |
| Mesero | andres@mesaviva.co   | `mesero123` | Terraza (mesas 5–8) |

Los `publicToken` de las mesas (para `/m/{token}`) son aleatorios; consúltalos con
`npx prisma studio` o en la tabla `"Table"`.

## Comandos

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run test:e2e`

## Pruebas

- `npm test`: Vitest (unitarias + integración contra `TEST_DATABASE_URL`; requiere Postgres).
- `npm run test:e2e`: Playwright, flujo completo cliente + mesero en tiempo real, concurrencia y permisos.
  Usa una BD propia que **se borra y siembra en cada ejecución** (`E2E_DATABASE_URL`, nunca la de desarrollo):

  ```bash
  psql "postgresql://postgres:<clave>@localhost:5432/postgres" -c "CREATE DATABASE restaurante_sistema_e2e"
  # en .env: E2E_DATABASE_URL="postgresql://postgres:<clave>@localhost:5432/restaurante_sistema_e2e"
  npm run test:e2e
  ```

  Compila y arranca la app en modo producción en el puerto 3300 (`E2E_PORT` para cambiarlo) y usa el
  Microsoft Edge instalado (`E2E_BROWSER_CHANNEL=chrome` para Google Chrome); no descarga navegadores.
