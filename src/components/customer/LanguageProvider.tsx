"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { customerMoney, ENGLISH_REVIEWED, LOCALE_COOKIE, normalizeLocale, translate, type Locale } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

const LanguageContext = createContext({ locale: "es" as Locale, setLocale: (() => {}) as (locale: Locale) => void, enabled: false });

export function LanguageProvider({ initialLocale, enabled, children }: { initialLocale: Locale; enabled: boolean; children: ReactNode }) {
  const [locale, updateLocale] = useState(initialLocale);
  function setLocale(value: Locale) {
    const next = enabled ? normalizeLocale(value) : "es";
    updateLocale(next);
    try {
      document.cookie = `${LOCALE_COOKIE}=${next}; Path=/m; Max-Age=31536000; SameSite=Lax${process.env.NODE_ENV === "production" || location.protocol === "https:" ? "; Secure" : ""}`;
    } catch { /* Sin cookies: conservar la elección en memoria. */ }
  }
  useEffect(() => {
    document.documentElement.lang = locale;
    return () => { document.documentElement.lang = "es"; };
  }, [locale]);
  return <LanguageContext value={{ locale, setLocale, enabled }}><div lang={locale} className="contents">{children}</div></LanguageContext>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  return {
    ...context,
    t: (key: MessageKey, params?: Record<string, string | number>) => translate(context.locale, key, params),
    money: (cents: number, currency = "COP") => customerMoney(cents, context.locale, currency),
  };
}

export function LanguageSelector() {
  const { locale, setLocale, enabled, t } = useLanguage();
  return <div className="flex flex-col items-start gap-1">
    <label className="flex min-h-11 flex-wrap items-center gap-2 text-sm font-bold">
      {t("language")}
      <select value={locale} onChange={(e) => setLocale(normalizeLocale(e.target.value))} className="min-h-11 max-w-full rounded-lg border border-tinta/30 bg-plato px-2">
        <option value="es" lang="es">Español</option><option value="en" lang="en" disabled={!enabled}>English</option>
      </select>
    </label>
    {locale === "en" && !ENGLISH_REVIEWED ? <p className="text-sm text-tinta-suave">{t("draft")}</p> : null}
  </div>;
}

export function CustomerHeading({ number, bill = false }: { number: number; bill?: boolean }) {
  const { t } = useLanguage();
  return <h1 className="sr-only">{t(bill ? "billTitle" : "menuTitle", { number })}</h1>;
}
export function TableLabel({ number }: { number: number }) {
  const { t } = useLanguage();
  return <>{t("table", { number })}</>;
}
export function CustomerMessage({ message }: { message: MessageKey }) {
  const { t } = useLanguage();
  return <>{t(message)}</>;
}
export function CustomerDocumentTitle({ number }: { number?: number }) {
  const { t, locale } = useLanguage();
  const pathname = usePathname();
  const title = number === undefined ? t("invalidTitle") : `${pathname.endsWith("/cuenta") ? t("metaBill") : t("metaMenu")} · ${t("table", { number })}`;
  useEffect(() => {
    document.title = `${title} · Mesa Viva`;
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute("content", translate(locale, "metaDescription"));
    return () => { description?.setAttribute("content", translate("es", "metaDescription")); };
  }, [title, locale]);
  return null;
}
