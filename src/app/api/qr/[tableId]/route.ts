// PNG del QR de una mesa (solo ADMIN). Codifica `${origen}/m/${publicToken}`; el origen sale de
// PUBLIC_BASE_URL (la URL pública que escanearán los clientes) o, si falta, del propio request.

import QRCode from "qrcode";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { tablePublicUrl } from "@/lib/domain/admin";

export async function GET(req: Request, ctx: RouteContext<"/api/qr/[tableId]">) {
  const session = await getSession();
  if (!session) return new Response("No autenticado", { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.sub }, select: { role: true, active: true } });
  if (!user || !user.active) return new Response("No autenticado", { status: 401 });
  if (user.role !== "ADMIN") return new Response("Prohibido", { status: 403 });

  const { tableId } = await ctx.params;
  if (!z.uuid().safeParse(tableId).success) return new Response("Mesa no encontrada", { status: 404 });
  const table = await db.table.findUnique({ where: { id: tableId }, select: { publicToken: true } });
  if (!table) return new Response("Mesa no encontrada", { status: 404 });

  const origin = process.env.PUBLIC_BASE_URL?.trim() || new URL(req.url).origin;
  const png = await QRCode.toBuffer(tablePublicUrl(origin, table.publicToken), {
    type: "png",
    width: 512,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#1d2b4a", light: "#ffffff" },
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // El token puede rotarse: nunca reutilizar una imagen vieja.
      "Cache-Control": "private, no-store",
    },
  });
}
