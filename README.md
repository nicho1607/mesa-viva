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
