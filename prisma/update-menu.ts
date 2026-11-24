import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { syncRestaurantMenu } from "./sync-restaurant-menu";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
syncRestaurantMenu(db)
  .then((count) => console.log(`Carta actualizada: ${count} productos. Pedidos, inventario, usuarios y mesas conservados.`))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => db.$disconnect());
