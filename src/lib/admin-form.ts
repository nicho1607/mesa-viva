// Estado de los formularios de administración (useActionState) y traducción de errores
// a errores por campo. Sin dependencias de Next: usable en tests y en componentes cliente.

import { ZodError } from "zod";
import { DomainError, ConflictError } from "@/lib/domain/errors";

export type AdminFormState = {
  /** null = aún no se ha enviado. */
  ok: boolean | null;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Valores enviados, para no perder lo escrito si hay errores. */
  values?: Record<string, string>;
};

export const INITIAL_FORM_STATE: AdminFormState = { ok: null };

const GENERIC = "No se pudo guardar. Inténtalo de nuevo.";

/** FormData → objeto plano de strings (sin archivos ni el campo `intent`). */
export function formDataToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (k === "intent" || k.startsWith("$ACTION")) continue;
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** Valores que se devuelven al formulario (nunca contraseñas). */
function echo(values: Record<string, string>): Record<string, string> {
  const { password: _pw, ...rest } = values;
  void _pw;
  return rest;
}

export function toFormState(e: unknown, values: Record<string, string> = {}): AdminFormState {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of e.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors, values: echo(values) };
  }
  if (e instanceof ConflictError && e.field) {
    return { ok: false, error: e.message, fieldErrors: { [e.field]: e.message }, values: echo(values) };
  }
  if (e instanceof DomainError) return { ok: false, error: e.message, values: echo(values) };
  if (e instanceof Error && e.name === "UnauthorizedError") {
    return { ok: false, error: e.message };
  }
  console.error("[admin] error inesperado", e);
  return { ok: false, error: GENERIC, values: echo(values) };
}
