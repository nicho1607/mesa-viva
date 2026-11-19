"use client";

import { useId } from "react";
import { NOTE_OPTIONS } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";
import { appendSuggestion, MAX_NOTE } from "@/lib/cart";

type Props = {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  autoFocus?: boolean;
};

/** Campo de nota para cocina (máx. 200) con sugerencias rápidas que se añaden al final. */
export function NoteField({ value, onChange, label, autoFocus }: Props) {
  const { t, locale } = useLanguage();
  const id = useId();
  const counterId = `${id}-counter`;
  const remaining = MAX_NOTE - value.length;
  return (
    <div>
      <label htmlFor={id} className="font-bold">
        {label ?? t("noteLabel")} <span className="font-normal text-tinta-suave">{t("optional")}</span>
      </label>
      <textarea
        id={id}
        value={value}
        maxLength={MAX_NOTE}
        rows={3}
        autoFocus={autoFocus}
        aria-describedby={`${counterId}${locale === "en" ? ` ${id}-help` : ""}`}
        placeholder={t("notePlaceholder")}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_NOTE))}
        className="mt-2 block w-full resize-none rounded-lg border border-tinta/30 bg-plato px-3 py-2.5 text-base text-tinta placeholder:text-tinta-suave/80 focus:border-tinta focus-visible:outline-azafran"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {NOTE_OPTIONS.map(({ value: s, key }) => {
          const used = value.toLowerCase().includes(s.toLowerCase());
          return (
            <button
              key={s}
              type="button"
              disabled={used || value.length + s.length + 2 > MAX_NOTE}
              onClick={() => onChange(appendSuggestion(value, s))}
              className="min-h-11 rounded-full border border-tinta/25 px-3.5 text-sm text-tinta hover:border-tinta disabled:border-tinta/10 disabled:text-tinta-suave"
            >
              {used ? `✓ ${t(key)}` : `+ ${t(key)}`}
            </button>
          );
        })}
      </div>
      {locale === "en" ? <p id={`${id}-help`} className="mt-2 text-sm text-tinta-suave">{t("noteHelp")}</p> : null}
      <p id={counterId} className="mt-1 text-right text-sm text-tinta-suave tabular-nums" aria-live="polite">
        {value.length}/{MAX_NOTE}
        <span className="sr-only">{remaining <= 20 ? t("remaining", { count: remaining }) : ""}</span>
      </p>
    </div>
  );
}
