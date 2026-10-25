import { jwtVerify, SignJWT } from "jose";

// Helpers puros de sesión (sin Prisma ni next/headers): usables desde src/proxy.ts.

export const SESSION_COOKIE = "mv_session";
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60; // 12 h

export const STAFF_ROLES = ["WAITER", "ADMIN", "CASHIER"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type SessionPayload = { sub: string; role: StaffRole; name: string };

const ALG = "HS256";

function getKey(secret = process.env.SESSION_SECRET): Uint8Array {
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET falta o es demasiado corto (mínimo 32 caracteres)");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(
  payload: SessionPayload,
  opts: { secret?: string; expiresInSeconds?: number; now?: number } = {},
): Promise<string> {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  return new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuedAt(iat)
    .setExpirationTime(iat + (opts.expiresInSeconds ?? SESSION_MAX_AGE_SECONDS))
    .sign(getKey(opts.secret));
}

/** Devuelve el payload si la firma y la expiración son válidas; si no, null. */
export async function verifySession(
  token: string | undefined | null,
  opts: { secret?: string } = {},
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(opts.secret), { algorithms: [ALG] });
    const { sub, role, name } = payload;
    if (typeof sub !== "string" || typeof name !== "string") return null;
    if (!STAFF_ROLES.includes(role as StaffRole)) return null;
    return { sub, role: role as StaffRole, name };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Sanea el parámetro `next` del login: solo rutas relativas del mismo origen bajo /staff
 * (evita open redirect). Cualquier otra cosa → "/staff".
 */
export function sanitizeNextPath(next: unknown, fallback = "/staff"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return fallback;
  // Rechaza "//evil", "/\evil", esquemas, caracteres de control y backslashes.
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) {
    return fallback;
  }
  let url: URL;
  try {
    url = new URL(next, "http://mesa-viva.local");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://mesa-viva.local") return fallback;
  const path = url.pathname;
  if (path !== "/staff" && !path.startsWith("/staff/")) return fallback;
  if (path === "/staff/login" || path.startsWith("/staff/login/")) return fallback;
  return path + url.search + url.hash;
}
