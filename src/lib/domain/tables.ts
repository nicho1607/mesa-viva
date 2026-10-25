// Mutaciones de mesa iniciadas por el cliente. No publican eventos (lo hace la Server Action).

import { z } from "zod";
import { db } from "@/lib/db";
import { InvalidTableError } from "@/lib/domain/errors";

export const callWaiterInput = z.object({
  token: z.string().min(1).max(128),
  reason: z.enum(["assistance", "bill"]),
});
export type CallWaiterReason = z.output<typeof callWaiterInput>["reason"];

export type CallWaiterResult = {
  tableId: string;
  tableNumber: number;
  /** Mesero de la orden abierta; si no hay, el de la mesa o el de su zona. */
  waiterId: string | null;
  orderId: string | null;
  reason: CallWaiterReason;
};

/** Marca la mesa como NEEDS_ATTENTION. Lanza `InvalidTableError` si el token no sirve. */
export async function requestWaiter(raw: unknown): Promise<CallWaiterResult> {
  const { token, reason } = callWaiterInput.parse(raw);
  return db.$transaction(async (tx) => {
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

    await tx.table.update({ where: { id: table.id }, data: { status: "NEEDS_ATTENTION" } });
    const open = table.orders[0];
    return {
      tableId: table.id,
      tableNumber: table.number,
      waiterId: open?.waiterId ?? table.waiterId ?? table.zone.waiterId ?? null,
      orderId: open?.id ?? null,
      reason,
    };
  });
}
