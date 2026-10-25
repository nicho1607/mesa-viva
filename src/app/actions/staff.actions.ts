"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyCredentials } from "@/lib/credentials";
import { SESSION_COOKIE, sanitizeNextPath, sessionCookieOptions, signSession } from "@/lib/session";

export type LoginState = { error?: string; email?: string };

const INVALID = "Email o contraseña incorrectos";

const LoginSchema = z.object({
  email: z.string().trim().max(254),
  password: z.string().max(200),
  next: z.string().optional(),
});

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: INVALID };
  const { email, password, next } = parsed.data;
  if (!email || !password) return { error: "Escribe tu email y tu contraseña", email };

  const user = await verifyCredentials(email, password);
  if (!user) return { error: INVALID, email };

  const token = await signSession({ sub: user.id, role: user.role, name: user.name });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  redirect(sanitizeNextPath(next));
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/staff/login");
}
