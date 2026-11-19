import { z } from "zod";
import type { Bill } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const date = z.iso.date().refine((value) => !value.startsWith("0000"));

export function salesDateRange(from: unknown, to: unknown) {
  const start = date.safeParse(from);
  const end = date.safeParse(to);
  if (!start.success || !end.success || start.data > end.data) return null;

  // Bogotá usa UTC−05:00. El límite superior es la medianoche del día siguiente.
  const gte = new Date(`${start.data}T00:00:00-05:00`);
  const lt = new Date(`${end.data}T00:00:00-05:00`);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

export function getClosedSales(closedAt: NonNullable<ReturnType<typeof salesDateRange>>) {
  return db.bill.findMany({
    where: { order: { status: "CLOSED", closedAt } },
    orderBy: [{ order: { closedAt: "desc" } }, { id: "desc" }],
    select: {
      id: true,
      total: true,
      paymentMethod: true,
      cashAmount: true,
      transferAmount: true,
      order: { select: { closedAt: true, table: { select: { number: true } } } },
    },
  });
}

type SalePayment = Pick<Bill, "total" | "paymentMethod" | "cashAmount" | "transferAmount">;

export function summarizeSales(sales: readonly SalePayment[]) {
  const summary = { total: 0, cash: 0, transfer: 0, unattributed: 0, unattributedCount: 0 };

  for (const { total, paymentMethod, cashAmount, transferAmount } of sales) {
    summary.total += total;
    switch (paymentMethod) {
      case "CASH":
        summary.cash += total;
        continue;
      case "TRANSFER":
        summary.transfer += total;
        continue;
      case "CARD":
        continue;
      case "MIXED":
        if (cashAmount !== null && transferAmount !== null &&
            cashAmount >= 0 && transferAmount >= 0 && cashAmount + transferAmount === total) {
          summary.cash += cashAmount;
          summary.transfer += transferAmount;
          continue;
        }
        break;
    }
    summary.unattributed += total;
    summary.unattributedCount++;
  }

  return summary;
}
