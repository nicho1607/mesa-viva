"use client";

import { localizedText } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";

export function TranslatedContent({ original, english }: { original: string; english?: string | null }) {
  const { locale, t } = useLanguage();
  const value = localizedText(locale, original, english);
  return <span lang={value.original ? "es" : undefined} className="[overflow-wrap:anywhere]">{value.text}{value.original ? " " : ""}{value.original ? <span lang="en" className="text-sm font-normal text-tinta-suave">({t("original")})</span> : null}</span>;
}
