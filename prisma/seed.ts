// Seed idempotente de Mesa Viva: se puede ejecutar varias veces sin duplicar datos.
// Ejecutar: `npx prisma db seed` (usa tsx, ver prisma.config.ts).
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Pesos colombianos -> centavos enteros. `cop(28000)` = 2.800.000. */
const cop = (pesos: number) => pesos * 100;

/** Token opaco para el QR de la mesa: 18 bytes -> 24 caracteres base64url. */
const newPublicToken = () => randomBytes(18).toString("base64url");

type SeedProduct = { name: string; description: string; price: number };

const MENU: { name: string; products: SeedProduct[] }[] = [
  {
    name: "Entradas",
    products: [
      { name: "Empanadas vallunas", description: "Tres empanadas de maíz rellenas de papa y carne, con ají de la casa.", price: cop(12000) },
      { name: "Patacones con hogao", description: "Patacones crocantes con hogao casero y queso costeño rallado.", price: cop(14000) },
      { name: "Arepitas con chicharrón", description: "Mini arepas de maíz peto con chicharrón crocante y guacamole.", price: cop(16000) },
      { name: "Ceviche de camarón", description: "Camarón en limón, cebolla morada, cilantro y salsa rosada, con chips de plátano.", price: cop(24000) },
      { name: "Sopa de tortilla", description: "Caldo de tomate especiado con tiras de tortilla, aguacate y crema.", price: cop(15000) },
    ],
  },
  {
    name: "Platos fuertes",
    products: [
      { name: "Bandeja paisa", description: "Frijoles, arroz, carne molida, chicharrón, chorizo, huevo frito, maduro, arepa y aguacate.", price: cop(38000) },
      { name: "Ajiaco santafereño", description: "Sopa de tres papas con pollo desmechado y guascas; con alcaparras, crema y arroz.", price: cop(32000) },
      { name: "Sobrebarriga en salsa criolla", description: "Sobrebarriga horneada en salsa criolla, con papa salada y arroz blanco.", price: cop(36000) },
      { name: "Mojarra frita", description: "Mojarra entera frita, con arroz de coco, patacones y ensalada.", price: cop(42000) },
      { name: "Pechuga a la plancha", description: "Pechuga marinada en hierbas con papas a la francesa y ensalada fresca.", price: cop(29000) },
    ],
  },
  {
    name: "Bebidas",
    products: [
      { name: "Limonada de coco", description: "Limonada frappé con crema de coco.", price: cop(11000) },
      { name: "Jugo de lulo", description: "Jugo natural de lulo en agua o en leche.", price: cop(8000) },
      { name: "Aguapanela con limón", description: "Aguapanela fría con limón, preparada en casa.", price: cop(6000) },
      { name: "Cerveza nacional", description: "Botella de 330 ml.", price: cop(9000) },
      { name: "Café tinto", description: "Café colombiano de origen, recién colado.", price: cop(4000) },
    ],
  },
  {
    name: "Postres",
    products: [
      { name: "Tres leches", description: "Bizcocho húmedo bañado en tres leches con canela.", price: cop(13000) },
      { name: "Postre de natas", description: "Receta tradicional boyacense de natas con uvas pasas.", price: cop(12000) },
      { name: "Brevas con arequipe", description: "Brevas caladas con arequipe y queso campesino.", price: cop(14000) },
      { name: "Obleas", description: "Obleas con arequipe, queso rallado y mermelada de mora.", price: cop(9000) },
    ],
  },
];

const DEMO_PASSWORD_WAITER = "mesero123";
const DEMO_PASSWORD_ADMIN = "admin123";

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

  // Menú
  for (const [ci, c] of MENU.entries()) {
    const category = await prisma.category.upsert({
      where: { name: c.name },
      update: { sortOrder: ci },
      create: { name: c.name, sortOrder: ci },
    });
    for (const [pi, p] of c.products.entries()) {
      const data = { ...p, sortOrder: pi, categoryId: category.id };
      const existing = await prisma.product.findFirst({
        where: { name: p.name, categoryId: category.id },
        select: { id: true },
      });
      if (existing) await prisma.product.update({ where: { id: existing.id }, data });
      else await prisma.product.create({ data });
    }
  }

  // Configuración
  for (const [key, value] of Object.entries(SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
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
