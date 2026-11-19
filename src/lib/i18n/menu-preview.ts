import drafts from "../../../docs/translations/menu.en.draft.json";
import type { MenuCategory, TableBillView } from "@/lib/domain/queries";
import { ENGLISH_RELEASED } from ".";

/** Catálogo publicado con revisión pendiente: nunca escribe ni aprueba traducciones. */
export function withMenuDrafts(categories: MenuCategory[], env = process.env): MenuCategory[] {
  if (!ENGLISH_RELEASED && (env.NODE_ENV !== "development" || env.CUSTOMER_ENGLISH_PREVIEW !== "true")) return categories;
  return categories.map((category) => ({
    ...category,
    nameEn: category.nameEn ?? drafts.categories.find((draft) => draft.source === category.name)?.nameEn ?? null,
    products: category.products.map((product) => {
      const draft = drafts.products.find((entry) => entry.sourceName === product.name);
      return {
        ...product,
        nameEn: product.nameEn ?? draft?.nameEn ?? null,
        // Una descripción editada necesita un nuevo borrador: no reutilizar ingredientes obsoletos.
        descriptionEn: product.descriptionEn ?? (draft?.sourceDescription === product.description ? draft.descriptionEn : null),
      };
    }),
  }));
}

/** Usa el nombre histórico original, nunca el producto actual, y no modifica snapshots. */
export function withBillDrafts(bill: TableBillView, env = process.env): TableBillView {
  if (!bill.order || (!ENGLISH_RELEASED && (env.NODE_ENV !== "development" || env.CUSTOMER_ENGLISH_PREVIEW !== "true"))) return bill;
  return {
    ...bill,
    order: {
      ...bill.order,
      rounds: bill.order.rounds.map((round) => ({
        ...round,
        items: round.items.map((item) => ({
          ...item,
          productNameEn: item.productNameEn ?? drafts.products.find((draft) => draft.sourceName === item.productName)?.nameEn ?? null,
        })),
      })),
    },
  };
}
