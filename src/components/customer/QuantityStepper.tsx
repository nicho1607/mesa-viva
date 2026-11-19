"use client";

import { useLanguage } from "./LanguageProvider";

import { MAX_QTY } from "@/lib/cart";

type Props = {
  value: number;
  onChange: (n: number) => void;
  /** Nombre del plato, para las etiquetas accesibles. */
  label: string;
  min?: number;
  size?: "md" | "lg";
};

export function QuantityStepper({ value, onChange, label, min = 1, size = "md" }: Props) {
  const { t } = useLanguage();
  const btn =
    size === "lg"
      ? "size-[48px] text-2xl"
      : "size-[44px] text-xl";
  return (
    <div className="inline-flex items-center rounded-full border border-tinta/25 bg-white" role="group" aria-label={t("quantity", { name: label })}>
      <button
        type="button"
        className={`${btn} inline-flex items-center justify-center rounded-full leading-none disabled:text-tinta/30`}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={t("decrease", { name: label })}
      >
        −
      </button>
      <output aria-live="polite" className={`${size === "lg" ? "min-w-[40px] text-xl" : "min-w-[32px] text-lg"} px-1 text-center font-bold tabular-nums`}>
        {value}
      </output>
      <button
        type="button"
        className={`${btn} inline-flex items-center justify-center rounded-full leading-none disabled:text-tinta/30`}
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_QTY}
        aria-label={t("increase", { name: label })}
      >
        +
      </button>
    </div>
  );
}
