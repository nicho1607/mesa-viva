"use client";

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
  const btn =
    size === "lg"
      ? "size-12 text-2xl"
      : "size-11 text-xl";
  return (
    <div className="inline-flex items-center rounded-full border border-tinta/25 bg-white" role="group" aria-label={`Cantidad de ${label}`}>
      <button
        type="button"
        className={`${btn} inline-flex items-center justify-center rounded-full leading-none disabled:text-tinta/30`}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={`Quitar uno de ${label}`}
      >
        −
      </button>
      <output aria-live="polite" className={`${size === "lg" ? "w-10 text-xl" : "w-8 text-lg"} text-center font-bold tabular-nums`}>
        {value}
      </output>
      <button
        type="button"
        className={`${btn} inline-flex items-center justify-center rounded-full leading-none disabled:text-tinta/30`}
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_QTY}
        aria-label={`Agregar uno de ${label}`}
      >
        +
      </button>
    </div>
  );
}
