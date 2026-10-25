// Plano de mesas para el personal (/staff). Sin Next: testeable con Vitest.

import { db } from "@/lib/db";
import type { Prisma, TableStatus } from "@/generated/prisma/client";
import { REASON_FROM_DB, type CallWaiterReason } from "@/lib/domain/tables";

export type FloorOrderSummary = {
  id: string;
  /** Ítems enviados que el mesero aún no confirma. */
  pendingCount: number;
  inPrepCount: number;
  servedCount: number;
  lastRound: number;
  openedAt: string; // ISO
  /** Suma de ítems no cancelados (centavos, sin propina). */
  subtotal: number;
};

export type FloorTable = {
  id: string;
  number: number;
  seats: number;
  zoneName: string;
  status: TableStatus;
  attentionReason: CallWaiterReason | null;
  order: FloorOrderSummary | null;
};

export type FloorZone = { id: string; name: string; tables: FloorTable[] };

/**
 * Mesas visibles para `user`:
 * - WAITER: asignadas directamente (`table.waiterId = me`) o, sin asignación directa,
 *   las de una zona suya (`zone.waiterId = me`).
 * - ADMIN / CASHIER: todas.
 * Excluye INACTIVE. Agrupadas por zona (orden por nombre) y mesas por número.
 */
export async function getFloorForStaff(user: { id: string; role: string }): Promise<FloorZone[]> {
  const where: Prisma.TableWhereInput = { status: { not: "INACTIVE" } };
  if (user.role === "WAITER") {
    where.OR = [{ waiterId: user.id }, { waiterId: null, zone: { waiterId: user.id } }];
  }

  const tables = await db.table.findMany({
    where,
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
      seats: true,
      status: true,
      attentionReason: true,
      zone: { select: { id: true, name: true } },
      orders: {
        where: { status: "OPEN" },
        take: 1,
        select: {
          id: true,
          lastRound: true,
          openedAt: true,
          items: { select: { status: true, quantity: true, unitPrice: true } },
        },
      },
    },
  });

  const zones = new Map<string, FloorZone>();
  for (const t of tables) {
    let zone = zones.get(t.zone.id);
    if (!zone) zones.set(t.zone.id, (zone = { id: t.zone.id, name: t.zone.name, tables: [] }));
    const o = t.orders[0];
    let order: FloorOrderSummary | null = null;
    if (o) {
      const count = (s: string) => o.items.filter((i) => i.status === s).length;
      order = {
        id: o.id,
        pendingCount: count("PENDING"),
        inPrepCount: count("IN_PREPARATION"),
        servedCount: count("SERVED"),
        lastRound: o.lastRound,
        openedAt: o.openedAt.toISOString(),
        subtotal: o.items
          .filter((i) => i.status !== "CANCELLED")
          .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
      };
    }
    zone.tables.push({
      id: t.id,
      number: t.number,
      seats: t.seats,
      zoneName: t.zone.name,
      status: t.status,
      attentionReason: t.status === "NEEDS_ATTENTION" && t.attentionReason ? REASON_FROM_DB[t.attentionReason] : null,
      order,
    });
  }
  return [...zones.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
