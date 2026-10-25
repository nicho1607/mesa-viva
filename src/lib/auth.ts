import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SESSION_COOKIE, verifySession, type SessionPayload, type StaffRole } from "@/lib/session";

export type StaffUser = { id: string; name: string; email: string; role: StaffRole };

export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED";
  constructor(message = "No tienes permiso para esta acción") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Lee y verifica la cookie de sesión (solo firma/expiración, sin BD). */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** True si `userRole` cumple `role`. ADMIN pasa cualquier chequeo de rol. */
export function hasRole(userRole: StaffRole, role?: StaffRole | StaffRole[]): boolean {
  if (!role) return true;
  if (userRole === "ADMIN") return true;
  return (Array.isArray(role) ? role : [role]).includes(userRole);
}

/**
 * Exige sesión de personal válida, re-leyendo el usuario de BD (rechaza inactivos).
 * Sin sesión → redirect a /staff/login. Con sesión pero sin rol → lanza UnauthorizedError.
 * Llamarla al inicio de toda página y Server Action de staff.
 */
export async function requireStaff(role?: StaffRole | StaffRole[]): Promise<StaffUser> {
  const session = await getSession();
  const user = session
    ? await db.user.findUnique({
        where: { id: session.sub },
        select: { id: true, name: true, email: true, role: true, active: true },
      })
    : null;
  if (!user || !user.active) redirect("/staff/login");
  if (!hasRole(user.role, role)) throw new UnauthorizedError();
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
