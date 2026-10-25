"use server";

// Server Action única de administración (MV-012), usada con useActionState por todos los
// formularios de /staff/admin. Capa delgada: requireStaff("ADMIN") → dominio → publicar
// `table.updated` (si cambia el salón) → revalidatePath. El campo oculto `intent` elige la operación.

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { formDataToObject, toFormState, type AdminFormState } from "@/lib/admin-form";
import { requireStaff } from "@/lib/auth";
import * as admin from "@/lib/domain/admin";
import type { Actor, FloorChange } from "@/lib/domain/admin";
import { FLOOR_CHANNEL, tableChannel, waiterChannel } from "@/lib/realtime/events";
import { publishMany } from "@/lib/realtime/publish";

const MENU = ["/staff/admin/menu"];
const FLOOR = ["/staff/admin/mesas", "/staff/admin/qr", "/staff"];
const TEAM = ["/staff/admin/equipo", "/staff/admin/mesas"];

type Handler = (actor: Actor, data: Record<string, string>) => Promise<{
  message: string;
  paths: string[];
  floor?: FloorChange;
}>;

const floorOp =
  (fn: (a: Actor, raw: unknown) => Promise<FloorChange>, message: string | ((c: FloorChange) => string)): Handler =>
  async (actor, data) => {
    const floor = await fn(actor, data);
    return { message: typeof message === "string" ? message : message(floor), paths: FLOOR, floor };
  };

const HANDLERS = {
  "category.create": async (a, d) => (await admin.createCategory(a, d), { message: "Categoría creada", paths: MENU }),
  "category.update": async (a, d) => (await admin.updateCategory(a, d), { message: "Categoría guardada", paths: MENU }),
  "category.delete": async (a, d) => (await admin.deleteCategory(a, d), { message: "Categoría eliminada", paths: MENU }),
  "product.create": async (a, d) => (await admin.createProduct(a, d), { message: "Producto creado", paths: MENU }),
  "product.update": async (a, d) => (await admin.updateProduct(a, d), { message: "Producto guardado", paths: MENU }),
  "product.available": async (a, d) => {
    const p = await admin.setProductAvailable(a, d);
    return { message: p.available ? "Marcado como disponible" : "Marcado como agotado", paths: MENU };
  },
  "product.delete": async (a, d) => (await admin.deleteProduct(a, d), { message: "Producto eliminado", paths: MENU }),
  "zone.create": floorOp(admin.createZone, "Zona creada"),
  "zone.update": floorOp(admin.updateZone, "Zona guardada"),
  "zone.delete": floorOp(admin.deleteZone, "Zona eliminada"),
  "table.create": floorOp(admin.createTable, (c) => `Mesa ${c.tableNumber} creada`),
  "table.update": floorOp(admin.updateTable, (c) => `Mesa ${c.tableNumber} guardada`),
  "table.active": floorOp(admin.setTableActive, (c) => `Mesa ${c.tableNumber} actualizada`),
  "table.delete": floorOp(admin.deleteTable, (c) => `Mesa ${c.tableNumber} eliminada`),
  "table.rotate": floorOp(admin.rotateTableToken, (c) => `Nuevo código para la mesa ${c.tableNumber}. Imprime su QR otra vez.`),
  "user.create": async (a, d) => (await admin.createUser(a, d), { message: "Cuenta creada", paths: TEAM }),
  "user.active": async (a, d) => {
    const u = await admin.setUserActive(a, d);
    return { message: u.active ? "Cuenta activada" : "Cuenta desactivada", paths: TEAM };
  },
  "user.password": async (a, d) => (
    await admin.resetUserPassword(a, d), { message: "Contraseña cambiada", paths: ["/staff/admin/equipo"] }
  ),
} satisfies Record<string, Handler>;

export type AdminIntent = keyof typeof HANDLERS;

async function publishFloorChange(c: FloorChange): Promise<void> {
  const channels = [FLOOR_CHANNEL, ...c.waiterIds.map(waiterChannel)];
  if (c.tableId) channels.push(tableChannel(c.tableId));
  await publishMany(channels, "table.updated", {
    ...(c.tableId ? { tableId: c.tableId } : {}),
    ...(c.tableNumber ? { tableNumber: c.tableNumber } : {}),
  });
}

export async function adminMutate(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const values = formDataToObject(formData);
  try {
    const actor = await requireStaff("ADMIN");
    const intent = formData.get("intent");
    const handler = typeof intent === "string" ? (HANDLERS as Record<string, Handler>)[intent] : undefined;
    if (!handler) return { ok: false, error: "Operación no válida." };

    const r = await handler(actor, values);
    if (r.floor) await publishFloorChange(r.floor);
    for (const p of r.paths) revalidatePath(p);
    return { ok: true, message: r.message };
  } catch (e) {
    unstable_rethrow(e); // el redirect a /staff/login de requireStaff debe propagarse
    return toFormState(e, values);
  }
}
