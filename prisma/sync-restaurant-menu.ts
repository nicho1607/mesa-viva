import type { PrismaClient } from "../src/generated/prisma/client";
import { RESTAURANT_MENU } from "./restaurant-menu";

// Solo retira productos de la carta demo; conserva productos añadidos por administración.
const DEMO_PRODUCTS = ["Empanadas vallunas", "Patacones con hogao", "Arepitas con chicharrón", "Ceviche de camarón", "Sopa de tortilla", "Bandeja paisa", "Ajiaco santafereño", "Sobrebarriga en salsa criolla", "Mojarra frita", "Pechuga a la plancha", "Limonada de coco", "Jugo de lulo", "Aguapanela con limón", "Cerveza nacional", "Café tinto", "Tres leches", "Postre de natas", "Brevas con arequipe", "Obleas"];

export const RESTAURANT_MENU_RELEASE = "_restaurantMenu20261123";

export async function syncRestaurantMenu(db: PrismaClient, once = false) {
  return db.$transaction(async (tx) => {
    if (once && await tx.setting.findUnique({ where: { key: RESTAURANT_MENU_RELEASE } })) return 0;
    const ids: string[] = [];
    for (const [sortOrder, category] of RESTAURANT_MENU.entries()) {
      const savedCategory = await tx.category.upsert({
        where: { name: category.name }, update: { sortOrder }, create: { name: category.name, sortOrder },
      });
      for (const [index, product] of category.products.entries()) {
        const existing = await tx.product.findFirst({ where: { name: product.name }, orderBy: { id: "asc" } });
        const data = { ...product, categoryId: savedCategory.id, sortOrder: index };
        const saved = existing
          ? await tx.product.update({ where: { id: existing.id }, data: { ...data, ...(existing.description !== product.description ? { descriptionEn: null } : {}) } })
          : await tx.product.create({ data });
        ids.push(saved.id);
      }
    }
    const retired = await tx.category.upsert({
      where: { name: "Carta anterior (retirada)" }, update: {}, create: { name: "Carta anterior (retirada)", sortOrder: 999 },
    });
    await tx.product.updateMany({ where: { name: { in: DEMO_PRODUCTS }, id: { notIn: ids } }, data: { available: false, categoryId: retired.id } });
    await tx.setting.upsert({ where: { key: RESTAURANT_MENU_RELEASE }, update: { value: "true" }, create: { key: RESTAURANT_MENU_RELEASE, value: "true" } });
    return ids.length;
  }, { timeout: 30000 });
}
