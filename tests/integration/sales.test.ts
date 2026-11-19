import { randomInt, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { db } from "@/lib/db";
import { getClosedSales, salesDateRange, summarizeSales } from "@/lib/domain/sales";

it("suma los cobros por medio y detecta importes sin atribuir en el día de Bogotá", async () => {
  const userId = randomUUID();
  const zoneId = randomUUID();
  const tableId = randomUUID();
  const fixtures = [
    { closedAt: "2025-05-10T04:59:59.999Z", total: 900_000, paymentMethod: "TRANSFER" },
    { closedAt: "2025-05-10T05:00:00.000Z", total: 3_000_000, paymentMethod: "CASH" },
    { closedAt: "2025-05-10T10:00:00.000Z", total: 2_000_000, paymentMethod: "TRANSFER" },
    {
      closedAt: "2025-05-11T04:59:59.999Z", total: 5_000_000, paymentMethod: "MIXED",
      cashAmount: 1_500_000, transferAmount: 3_500_000,
    },
    { closedAt: "2025-05-10T11:00:00.000Z", total: 800_000, paymentMethod: "CARD" },
    { closedAt: "2025-05-10T12:00:00.000Z", total: 700_000, paymentMethod: null },
    { closedAt: "2025-05-10T13:00:00.000Z", total: 600_000, paymentMethod: "MIXED", transferAmount: 300_000 },
    { closedAt: "2025-05-11T05:00:00.000Z", total: 900_000, paymentMethod: "CASH" },
  ] as const;

  try {
    await db.user.create({
      data: { id: userId, name: "Ventas", email: `${userId}@test.local`, passwordHash: "x", role: "ADMIN" },
    });
    await db.zone.create({ data: { id: zoneId, name: `Ventas ${zoneId}` } });
    await db.table.create({
      data: { id: tableId, number: randomInt(2_000_000, 2_000_000_000), publicToken: tableId, zoneId },
    });
    for (const { closedAt, ...payment } of fixtures) {
      await db.order.create({
        data: {
          tableId,
          status: "CLOSED",
          closedAt: new Date(closedAt),
          bill: {
            create: {
              ...payment,
              subtotal: payment.total,
              taxRate: 0,
              taxAmount: 0,
              tipRate: 0,
              tipAmount: 0,
              lines: [],
              closedById: userId,
            },
          },
        },
      });
    }

    const range = salesDateRange("2025-05-10", "2025-05-10");
    expect(range).not.toBeNull();
    const sales = await getClosedSales(range!);
    expect(sales).toHaveLength(6);
    expect(summarizeSales(sales)).toEqual({
      total: 12_100_000,
      cash: 4_500_000,
      transfer: 5_500_000,
      unattributed: 1_300_000,
      unattributedCount: 2,
    });
  } finally {
    await db.bill.deleteMany({ where: { closedById: userId } });
    await db.order.deleteMany({ where: { tableId } });
    await db.table.deleteMany({ where: { id: tableId } });
    await db.zone.deleteMany({ where: { id: zoneId } });
    await db.user.deleteMany({ where: { id: userId } });
  }
});
