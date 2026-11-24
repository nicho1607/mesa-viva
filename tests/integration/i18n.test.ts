import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import * as admin from "@/lib/domain/admin";
import { addItemsToOrder, addItemsToOrderByTableId, closeOrder } from "@/lib/domain/orders";
import { getMenuData, getTableBillData } from "@/lib/domain/queries";
import { getTableBill } from "@/app/actions/order.actions";

const tag = randomBytes(6).toString("hex");
const actor = { id: "", role: "ADMIN" };
let zoneId = "", categoryId = "", tableId = "", token = "", productId = "";
const productRaw = (extra = {}) => ({ name: `Sopa ${tag}`, description: "Sopa con papa", price: "12.000", categoryId, available: "on", ...extra });

beforeAll(async () => {
  actor.id = (await db.user.create({ data: { name: "Revisor fixture", email: `${tag}@i18n.test`, role: "ADMIN", passwordHash: "x" } })).id;
  zoneId = (await db.zone.create({ data: { name: `Idioma ${tag}` } })).id;
  categoryId = (await admin.createCategory(actor, { name: `Sopas ${tag}`, nameEn: "Soups", englishReviewed: "on" })).id;
  const table = await db.table.create({ data: { number: 800000 + parseInt(tag.slice(0, 4), 16), zoneId, publicToken: `i18n-${tag}` } });
  tableId = table.id; token = table.publicToken;
});
afterAll(async () => {
  const orders = await db.order.findMany({ where: { tableId }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await db.bill.deleteMany({ where: { orderId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await db.order.deleteMany({ where: { id: { in: ids } } });
  await db.table.deleteMany({ where: { id: tableId } });
  await db.zone.deleteMany({ where: { id: zoneId } });
  await db.product.deleteMany({ where: { categoryId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.user.deleteMany({ where: { id: actor.id } });
});

describe("contenido bilingüe e históricos", () => {
  it("no publica borradores; solo persiste inglés con confirmación explícita", async () => {
    const draft = await admin.createProduct(actor, productRaw({ nameEn: "Soup draft", descriptionEn: "Potato soup draft" }));
    productId = draft.id;
    expect(draft.nameEn).toBeNull(); expect(draft.descriptionEn).toBeNull();
    const approved = await admin.updateProduct(actor, productRaw({ id: productId, nameEn: "Soup fixture", descriptionEn: "Potato soup fixture", englishReviewed: "on" }));
    expect(approved.nameEn).toBe("Soup fixture");
    const menu = (await getMenuData()).find((c) => c.id === categoryId)!;
    expect(menu.nameEn).toBe("Soups");
    expect(menu.products.find((p) => p.id === productId)?.descriptionEn).toBe("Potato soup fixture");
  });

  it("copias históricas desde cliente y personal sobreviven cambios del menú y cierre", async () => {
    const order = await addItemsToOrder({ token, items: [{ productId, quantity: 1, notes: "Sin cebolla" }] });
    await addItemsToOrderByTableId({ tableId, items: [{ productId, quantity: 2 }] });
    let bill = await getTableBillData(token);
    if (!bill.order) throw new Error("sin orden");
    expect(bill.order.rounds.flatMap((r) => r.items).map((i) => i.productNameEn)).toEqual(["Soup fixture", "Soup fixture"]);
    const totals = bill.totals;
    const changed = await admin.updateProduct(actor, productRaw({ id: productId, name: `Caldo ${tag}`, description: "Caldo con arroz", nameEn: "Soup fixture", descriptionEn: "Potato soup fixture" }));
    expect(changed.nameEn).toBeNull(); expect(changed.descriptionEn).toBeNull();
    await closeOrder(order.orderId, actor.id, { paymentMethod: "CARD", closeOperationId: crypto.randomUUID() });
    bill = await getTableBillData(token);
    if (!bill.order) throw new Error("sin orden");
    expect(bill.customerStatus).toBe("CLOSED");
    expect(bill.totals.total).toBe(totals.total);
    expect(bill.order.rounds[0].items[0]).toMatchObject({ productName: `Sopa ${tag}`, productNameEn: "Soup fixture", notes: "Sin cebolla" });
    const stored = await db.bill.findUniqueOrThrow({ where: { orderId: order.orderId } });
    expect(JSON.stringify(stored.lines)).toContain(`Sopa ${tag}`);
    expect(JSON.stringify(stored.lines)).not.toContain("Soup fixture");
  });

  it("reaprueba traducciones y mantiene históricos previos sin rellenarlos", async () => {
    const approved = await admin.updateProduct(actor, productRaw({ id: productId, nameEn: "New soup", descriptionEn: "New description", englishReviewed: true }));
    expect(approved.nameEn).toBe("New soup");
    const unchanged = await admin.updateProduct(actor, productRaw({ id: productId }));
    expect(unchanged.nameEn).toBe("New soup");
    const order = await addItemsToOrder({ token, items: [{ productId, quantity: 1 }] });
    // Fixture de una orden anterior a la migración; no modifica el menú.
    await db.orderItem.updateMany({ where: { orderId: order.orderId }, data: { productNameEn: null } });
    const bill = await getTableBillData(token);
    expect(bill.order?.rounds[0].items[0].productNameEn).toBeNull();
    expect(bill.order?.rounds[0].items[0].productName).toBe(`Sopa ${tag}`);
    const category = await admin.updateCategory(actor, { id: categoryId, name: `Caldos ${tag}`, nameEn: "Soups" });
    expect(category.nameEn).toBeNull();
    expect((await admin.updateCategory(actor, { id: categoryId, name: `Caldos ${tag}`, nameEn: "Broths", englishReviewed: "on" })).nameEn).toBe("Broths");
    await expect(admin.updateProduct({ id: actor.id, role: "WAITER" }, productRaw({ id: productId, englishReviewed: true }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("la vista previa pública traduce la cuenta abierta y cerrada sin escribir borradores", async () => {
    const product = await admin.createProduct(actor, productRaw({ name: "Patacones con hogao" }));
    const order = await addItemsToOrder({ token, items: [{ productId: product.id, quantity: 1 }] });
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CUSTOMER_ENGLISH_PREVIEW", "true");
    try {
      for (const closed of [false, true]) {
        if (closed) await closeOrder(order.orderId, actor.id, { paymentMethod: "CARD", closeOperationId: crypto.randomUUID() });
        const before = await getTableBillData(token);
        const preview = await getTableBill(token);
        if (!preview.ok || !preview.data.order || !before.order) throw new Error("No se obtuvo la cuenta");
        const translated = preview.data.order.rounds.flatMap((r) => r.items).find((i) => i.productName === product.name);
        expect(translated?.productNameEn).toBe("Patacones — fried plantains with hogao sauce");
        expect(preview.data.totals).toEqual(before.totals);
        expect(await getTableBillData(token)).toEqual(before);
        const stored = await db.orderItem.findMany({ where: { orderId: order.orderId, productId: product.id } });
        expect(stored[0].productName).toBe("Patacones con hogao");
        expect(stored[0].productNameEn).toBeNull();
        expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).nameEn).toBeNull();
        if (closed) {
          const snapshot = await db.bill.findUniqueOrThrow({ where: { orderId: order.orderId } });
          expect(JSON.stringify(snapshot.lines)).toContain("Patacones con hogao");
          expect(JSON.stringify(snapshot.lines)).not.toContain("Patacones — fried plantains with hogao sauce");
        }
      }
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("CUSTOMER_ENGLISH_PREVIEW", "false");
      const production = await getTableBill(token);
      if (!production.ok || !production.data.order) throw new Error("No se obtuvo la cuenta publicada");
      expect(production.data.order.rounds.flatMap((r) => r.items).find((i) => i.productName === product.name)?.productNameEn).toBe("Patacones — fried plantains with hogao sauce");
      expect((await getTableBillData(token)).order?.rounds.flatMap((r) => r.items).find((i) => i.productName === product.name)?.productNameEn).toBeNull();
    } finally { vi.unstubAllEnvs(); }
  });
});
