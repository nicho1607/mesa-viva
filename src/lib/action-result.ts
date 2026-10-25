// Resultado tipado de Server Actions: los errores viajan como datos, nunca como excepción.

import { ZodError } from "zod";
import { DomainError, UnavailableProductsError } from "@/lib/domain/errors";

export type ActionError = {
  ok: false;
  error: string; // mensaje en español apto para la UI
  code: string; // p.ej. VALIDATION, INVALID_TABLE, UNAVAILABLE_PRODUCTS, RATE_LIMITED, INTERNAL
  details?: { productIds?: string[] };
};

export type ActionResult<T> = { ok: true; data: T } | ActionError;

export const GENERIC_ERROR = "No pudimos procesar tu pedido. Inténtalo de nuevo.";

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

function describeIssue(issue: ZodError["issues"][number]): string {
  const path = issue.path.map(String);
  const last = path[path.length - 1];
  if (path[0] === "token") return "el código de la mesa no es válido";
  if (last === "quantity") return "la cantidad de cada producto debe estar entre 1 y 20";
  if (last === "notes") return "las notas admiten máximo 200 caracteres";
  if (last === "productId") return "hay un producto no válido";
  if (path[0] === "items" && path.length === 1) {
    if (issue.code === "too_small") return "agrega al menos un producto";
    if (issue.code === "too_big") return "puedes enviar máximo 30 productos a la vez";
  }
  if (path[0] === "reason") return "el motivo no es válido";
  return "hay datos no válidos";
}

/** Traduce cualquier error a `ActionError`. Los desconocidos se registran y se ocultan. */
export function toActionError(e: unknown): ActionError {
  if (e instanceof UnavailableProductsError) {
    return { ok: false, error: e.message, code: e.code, details: { productIds: e.productIds } };
  }
  if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ZodError) {
    const msgs = [...new Set(e.issues.map(describeIssue))];
    return { ok: false, error: `Revisa tu pedido: ${msgs.join("; ")}.`, code: "VALIDATION" };
  }
  console.error("[action] error inesperado", e);
  return { ok: false, error: GENERIC_ERROR, code: "INTERNAL" };
}
