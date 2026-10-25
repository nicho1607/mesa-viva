import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/session";
import { FLOOR_CHANNEL, tableChannel, waiterChannel } from "./events";

const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Decide a qué canal SSE puede escuchar quien pide `/api/events`.
 * - `?table=<publicToken>` de una mesa existente y no INACTIVE → `table:{id}`.
 * - Sesión de staff activa (re-leída de BD): WAITER → `waiter:{id}`; ADMIN/CASHIER → `staff:floor`.
 * - Cualquier otro caso → null (401).
 */
export async function resolveAuthorizedChannel(input: {
  tableToken: string | null;
  session: SessionPayload | null;
}): Promise<string | null> {
  if (input.tableToken !== null) {
    if (!TOKEN_RE.test(input.tableToken)) return null;
    const table = await db.table.findUnique({
      where: { publicToken: input.tableToken },
      select: { id: true, status: true },
    });
    if (!table || table.status === "INACTIVE") return null;
    return tableChannel(table.id);
  }

  if (!input.session) return null;
  const user = await db.user.findUnique({
    where: { id: input.session.sub },
    select: { id: true, role: true, active: true },
  });
  if (!user || !user.active) return null;
  if (user.role === "WAITER") return waiterChannel(user.id);
  if (user.role === "ADMIN" || user.role === "CASHIER") return FLOOR_CHANNEL;
  return null;
}
