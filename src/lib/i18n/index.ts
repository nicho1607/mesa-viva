import { es, en, type MessageKey } from "./messages";
import { formatMoney } from "@/lib/money";
import type { ActionError } from "@/lib/action-result";

export type Locale = "es" | "en";
export const LOCALE_COOKIE = "mv_customer_locale";
export const ENGLISH_REVIEWED = false;
// Publicación autorizada; la validación lingüística y gastronómica sigue pendiente.
export const ENGLISH_RELEASED = true;
export const normalizeLocale = (value: unknown): Locale => value === "en" ? "en" : "es";
export function englishEnabled(production: boolean, preview: boolean) {
  return ENGLISH_RELEASED || ENGLISH_REVIEWED || !production || preview;
}
export function translate(locale: Locale, key: MessageKey, params: Record<string, string | number> = {}): string {
  return (locale === "en" ? en[key] : es[key]).replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]));
}
export const customerMoney = (cents: number, locale: Locale, currency = "COP") =>
  locale === "es" ? formatMoney(cents, currency) : formatMoney(cents, currency, "en", "code").replace(/\u00a0/g, " ");

export function localizedText(locale: Locale, original: string, english?: string | null) {
  return { text: locale === "en" && english ? english : original, original: locale === "en" && !english };
}

export const NOTE_OPTIONS = [
  { key: "noOnion", value: "Sin cebolla" }, { key: "medium", value: "Término medio" }, { key: "sauceSide", value: "Salsa aparte" },
] as const;

export function validationKey(issue: { path: PropertyKey[]; code: string }): MessageKey {
  const first = issue.path[0];
  const last = issue.path.at(-1);
  if (first === "token") return "invalidToken";
  if (last === "quantity") return "invalidQuantity";
  if (last === "notes") return "invalidNotes";
  if (last === "productId") return "invalidProduct";
  if (first === "items" && issue.path.length === 1) {
    if (issue.code === "too_small") return "emptyItems";
    if (issue.code === "too_big") return "tooManyItems";
  }
  if (first === "reason") return "invalidReason";
  if (first === "paymentMethod") return "invalidPayment";
  if (first === "tipRate") return "invalidTip";
  return "invalidData";
}

export function customerError(locale: Locale, error: Pick<ActionError, "code" | "details">): string {
  const keys: Record<string, MessageKey> = {
    NETWORK: "networkError", UNAVAILABLE_PRODUCTS: "unavailableError", ORDER_CLOSED: "orderClosed",
    INVALID_TABLE: "invalidTitle", RATE_LIMITED: "rateLimit", CALL_RATE_LIMITED: "callRateLimit", CALL_FAILED: "callError",
  };
  if (error.code === "VALIDATION") {
    const issues = error.details?.issues ?? ["invalidData"];
    return translate(locale, "validation", { issues: issues.map((key) => translate(locale, key)).join("; ") });
  }
  return translate(locale, Object.hasOwn(keys, error.code) ? keys[error.code] : "internal");
}
