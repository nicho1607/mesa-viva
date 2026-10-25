import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Chequeo barato (solo firma JWT) para /staff/*. Las páginas y Server Actions siguen
// llamando a requireStaff(), que re-lee el usuario de BD.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLogin = pathname === "/staff/login" || pathname.startsWith("/staff/login/");
  // El login siempre es accesible (no redirigimos a /staff aunque haya cookie: si el
  // usuario fue desactivado, requireStaff lo manda aquí y se formaría un bucle).
  if (isLogin) return NextResponse.next();

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const url = new URL("/staff/login", request.url);
    url.searchParams.set("next", pathname + search);
    const res = NextResponse.redirect(url);
    // Cookie inválida o expirada: limpiarla.
    if (request.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/staff", "/staff/:path*"],
};
