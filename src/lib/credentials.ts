import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { StaffRole } from "@/lib/session";

// Hash bcrypt válido (coste 10) de una cadena aleatoria: se compara cuando el usuario
// no existe o está inactivo para que el tiempo de respuesta no revele qué emails existen.
const DUMMY_HASH = "$2b$10$OISsfNPI7IQqottF/tmt9e99x5YpEZa99QqJodtBDm5SzXHK2M5yO";

export type StaffIdentity = { id: string; name: string; role: StaffRole };

/** Verifica email + contraseña. Devuelve el usuario activo o null (sin decir qué falló). */
export async function verifyCredentials(email: string, password: string): Promise<StaffIdentity | null> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, role: true, active: true, passwordHash: true },
  });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.active || !ok) return null;
  return { id: user.id, name: user.name, role: user.role };
}
