// Seed idempotente de Mesa Viva: se puede ejecutar varias veces sin duplicar datos.
// Ejecutar: `npx prisma db seed` (usa tsx, ver prisma.config.ts).
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";
import { seedConfig } from "./seed-config";
import { syncRestaurantMenu } from "./sync-restaurant-menu";

const { production, adminPassword, waiterPassword } = seedConfig();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Token opaco para los QR de mesa. */
const newPublicToken = () => randomBytes(18).toString("base64url");

const DEMO_PASSWORD_WAITER = waiterPassword;
const DEMO_PASSWORD_ADMIN = adminPassword;

const USERS: { email: string; name: string; role: Role; password: string }[] = [
  { email: "admin@mesaviva.co", name: "Administración", role: Role.ADMIN, password: DEMO_PASSWORD_ADMIN },
  { email: "laura@mesaviva.co", name: "Laura Gómez", role: Role.WAITER, password: DEMO_PASSWORD_WAITER },
  { email: "andres@mesaviva.co", name: "Andrés Restrepo", role: Role.WAITER, password: DEMO_PASSWORD_WAITER },
];

// Cada zona queda a cargo de un mesero; mesas 1-4 en el salón, 5-8 en la terraza.
const ZONES = [
  { name: "Salón principal", waiterEmail: "laura@mesaviva.co", tables: [1, 2, 3, 4] },
  { name: "Terraza", waiterEmail: "andres@mesaviva.co", tables: [5, 6, 7, 8] },
];

const SETTINGS: Record<string, string> = {
  taxRate: "0.19", // IVA Colombia
  pricesIncludeTax: "true", // los precios del menú ya incluyen IVA; taxRate solo desglosa
  tipRate: "0.10", // propina sugerida
  currency: "COP",
  restaurantName: "Mesa Viva",
};

async function main() {
  // En producción se inicializa una vez: los reinicios no deben restaurar menú ni contraseñas.
  if (production && await prisma.setting.findUnique({ where: { key: "_seedInitialized" } })) {
    const updated = await syncRestaurantMenu(prisma, true);
    if (updated) console.log(`Carta real publicada: ${updated} productos.`);
    console.log("La base de producción ya está inicializada; se conservan sus datos.");
    return;
  }
  // Usuarios
  const userIds = new Map<string, string>();
  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash, active: true },
      create: { email: u.email, name: u.name, role: u.role, passwordHash },
    });
    userIds.set(u.email, user.id);
  }

  // Zonas y mesas (el publicToken solo se genera al crear: re-ejecutar no invalida los QR)
  for (const z of ZONES) {
    const waiterId = userIds.get(z.waiterEmail)!;
    const zone = await prisma.zone.upsert({
      where: { name: z.name },
      update: { waiterId },
      create: { name: z.name, waiterId },
    });
    for (const number of z.tables) {
      await prisma.table.upsert({
        where: { number },
        update: { zoneId: zone.id },
        create: { number, seats: number % 4 === 0 ? 6 : 4, zoneId: zone.id, publicToken: newPublicToken() },
      });
    }
  }

  // Menú real, compartido con la actualización independiente de la carta.
  await syncRestaurantMenu(prisma);

  // Configuración
  for (const [key, value] of Object.entries(SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  if (production) {
    await prisma.setting.upsert({
      where: { key: "_seedInitialized" },
      update: { value: "true" },
      create: { key: "_seedInitialized", value: "true" },
    });
  }

  const counts = {
    usuarios: await prisma.user.count(),
    zonas: await prisma.zone.count(),
    mesas: await prisma.table.count(),
    categorias: await prisma.category.count(),
    productos: await prisma.product.count(),
    settings: await prisma.setting.count(),
  };
  console.log("Seed completado:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
