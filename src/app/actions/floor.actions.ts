"use server";

// Server Actions del plano de mesas (staff). Capa delgada: requireStaff → dominio → publicar.

import { unstable_rethrow } from "next/navigation";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { requireStaff, UnauthorizedError } from "@/lib/auth";
import { getFloorForStaff, type FloorZone } from "@/lib/domain/floor";
import { acknowledgeTable as acknowledgeTableDomain } from "@/lib/domain/tables";
import { FLOOR_CHANNEL, waiterChannel } from "@/lib/realtime/events";
import { publishMany } from "@/lib/realtime/publish";

/** Plano visible para el usuario actual (lo usa el refetch del cliente). */
export async function getFloor(): Promise<ActionResult<FloorZone[]>> {
  try {
    const user = await requireStaff();
    return { ok: true, data: await getFloorForStaff(user) };
  } catch (e) {
    unstable_rethrow(e); // el redirect a /staff/login de requireStaff debe propagarse
    if (e instanceof UnauthorizedError) return { ok: false, error: e.message, code: e.code };
    return toActionError(e);
  }
}

/** "Atendido": la mesa deja de llamar (OCCUPIED u AVAILABLE) y se avisa al salón y al mesero. */
export async function acknowledgeTable(tableId: string): Promise<ActionResult<{ status: string }>> {
  try {
    const user = await requireStaff();
    const r = await acknowledgeTableDomain({ tableId }, user);
    if (r.changed) {
      const channels = [FLOOR_CHANNEL];
      if (r.waiterId) channels.push(waiterChannel(r.waiterId));
      await publishMany(channels, "table.updated", {
        tableId: r.tableId,
        tableNumber: r.tableNumber,
        ...(r.orderId ? { orderId: r.orderId } : {}),
      });
    }
    return { ok: true, data: { status: r.status } };
  } catch (e) {
    unstable_rethrow(e); // el redirect a /staff/login de requireStaff debe propagarse
    if (e instanceof UnauthorizedError) return { ok: false, error: e.message, code: e.code };
    return toActionError(e);
  }
}
