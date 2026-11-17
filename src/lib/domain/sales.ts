import { z } from "zod";
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
      order: { select: { closedAt: true, table: { select: { number: true } } } },
    },
  });
}
