// Mutaciones de mesa (llamada del cliente, "Atendido" del mesero).
// No publican eventos: lo hace la Server Action tras el commit.

import { z } from "zod";
import { db } from "@/lib/db";
import type { AttentionReason, TableStatus } from "@/generated/prisma/client";
import { ForbiddenError, InvalidTableError, NotFoundError } from "@/lib/domain/errors";
import { isResponsibleWaiter } from "@/lib/domain/permissions";

export const callWaiterInput = z.object({
  token: z.string().min(1).max(128),
  reason: z.enum(["assistance", "bill"]),
});
export type CallWaiterReason = z.output<typeof callWaiterInput>["reason"];

/** Motivo del contrato (minúsculas, viaja en eventos) ↔ enum de BD. */
export const REASON_TO_DB: Record<CallWaiterReason, AttentionReason> = { assistance: "ASSISTANCE", bill: "BILL" };
export const REASON_FROM_DB: Record<AttentionReason, CallWaiterReason> = { ASSISTANCE: "assistance", BILL: "bill" };

export type CallWaiterResult = {
  tableId: string;
  tableNumber: number;
  /** Mesero de la orden abierta; si no hay, el de la mesa o el de su zona. */
  waiterId: string | null;
  assignedWaiterId: string | null;
  orderId: string | null;
  reason: CallWaiterReason;
};

/**
 * Marca la mesa como NEEDS_ATTENTION y guarda el motivo (`attentionReason`).
 * Una nueva llamada sobrescribe el motivo (lo último que pidió la mesa).
 * Lanza `InvalidTableError` si el token no sirve.
 */
export async function requestWaiter(raw: unknown): Promise<CallWaiterResult> {
  const { token, reason } = callWaiterInput.parse(raw);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Table" WHERE "publicToken" = ${token} FOR UPDATE`;
    const table = await tx.table.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        number: true,
        status: true,
        waiterId: true,
        zone: { select: { waiterId: true } },
        orders: { where: { status: "OPEN" }, select: { id: true, waiterId: true }, take: 1 },
      },
    });
    if (!table || table.status === "INACTIVE") throw new InvalidTableError();

    await tx.table.update({
      where: { id: table.id },
      data: { status: "NEEDS_ATTENTION", attentionReason: REASON_TO_DB[reason] },
    });
    const open = table.orders[0];
    return {
      tableId: table.id,
      tableNumber: table.number,
      waiterId: open?.waiterId ?? table.waiterId ?? table.zone.waiterId ?? null,
      assignedWaiterId: table.waiterId ?? table.zone.waiterId ?? null,
      orderId: open?.id ?? null,
      reason,
    };
  });
}

export const acknowledgeTableInput = z.object({ tableId: z.uuid() });

export type AcknowledgeResult = {
  tableId: string;
  tableNumber: number;
  /** Estado resultante (o el actual si no cambió). */
  status: TableStatus;
  /** Mesero responsable (orden abierta → mesa → zona) para publicar al canal correcto. */
  waiterId: string | null;
  assignedWaiterId: string | null;
  orderId: string | null;
  /** false si la mesa no estaba llamando (no se cambió nada). */
  changed: boolean;
};

/**
 * "Atendido": NEEDS_ATTENTION → OCCUPIED (si hay orden abierta) o AVAILABLE, y borra el motivo.
 * Solo el mesero responsable (de la orden abierta, de la mesa o de su zona) o un ADMIN.
 * Idempotente: si la mesa ya no está llamando devuelve `changed: false`.
 */
export async function acknowledgeTable(
  raw: unknown,
  user: { id: string; role: string },
): Promise<AcknowledgeResult> {
  const { tableId } = acknowledgeTableInput.parse(raw);
  return db.$transaction(async (tx) => {
    // Bloquear la fila para no pisar una llamada concurrente
    await tx.$queryRaw`SELECT id FROM "Table" WHERE id = ${tableId} FOR UPDATE`;
    const table = await tx.table.findUnique({
      where: { id: tableId },
      select: {
        id: true,
        number: true,
        status: true,
        waiterId: true,
        zone: { select: { waiterId: true } },
        orders: { where: { status: "OPEN" }, select: { id: true, waiterId: true }, take: 1 },
      },
    });
    if (!table) throw new NotFoundError("Mesa");
    const open = table.orders[0];
    const assigned = table.waiterId ?? table.zone.waiterId ?? null;
    const responsible = open?.waiterId ?? assigned;
    const r = { orderWaiterId: open?.waiterId ?? null, assignedWaiterId: assigned };
    if (user.role !== "ADMIN" && !isResponsibleWaiter(user.id, r)) {
      throw new ForbiddenError();
    }

    const status = open ? "OCCUPIED" : "AVAILABLE";
    const base = { tableId: table.id, tableNumber: table.number, waiterId: responsible, assignedWaiterId: assigned, orderId: open?.id ?? null };
    if (table.status !== "NEEDS_ATTENTION") {
      return { ...base, status: table.status, changed: false };
    }
    await tx.table.update({ where: { id: table.id }, data: { status, attentionReason: null } });
    return { ...base, status, changed: true };
  });
}
