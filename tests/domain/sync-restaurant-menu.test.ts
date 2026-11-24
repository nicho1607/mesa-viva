import { expect, it, vi } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { RESTAURANT_MENU_RELEASE, syncRestaurantMenu } from "../../prisma/sync-restaurant-menu";

it("no restaura precios al reiniciar una producción que ya recibió la carta", async () => {
  const tx = { setting: { findUnique: vi.fn().mockResolvedValue({ value: "true" }) } };
  const db = { $transaction: async (run: (value: typeof tx) => Promise<number>) => run(tx) };
  expect(await syncRestaurantMenu(db as unknown as PrismaClient, true)).toBe(0);
  expect(tx.setting.findUnique).toHaveBeenCalledWith({ where: { key: RESTAURANT_MENU_RELEASE } });
});
