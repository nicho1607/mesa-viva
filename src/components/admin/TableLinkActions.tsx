"use client";

import { useState } from "react";
import { btn, inputClass } from "./styles";

export function TableLinkActions({ href, tableNumber }: { href: string; tableNumber: number }) {
  const [result, setResult] = useState<"idle" | "copied" | "manual">("idle");
  const [manualUrl, setManualUrl] = useState("");

  async function copyLink() {
    const url = new URL(href, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setResult("copied");
    } catch {
      setManualUrl(url);
      setResult("manual");
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 print:hidden">
      <div className="flex flex-wrap justify-center gap-2">
        <a href={href} target="_blank" rel="noopener noreferrer" className={btn.secondary}
          aria-label={`Abrir menú de la mesa ${tableNumber} en otra pestaña`}>
          Abrir menú
        </a>
        <button type="button" onClick={copyLink} className={btn.secondary}
          aria-label={`Copiar enlace de la mesa ${tableNumber}`}>
          Copiar enlace
        </button>
      </div>
      <p role="status" className="text-sm text-tinta-suave">
        {result === "copied" ? "Enlace copiado." : result === "manual" ? "No se pudo copiar. Selecciona y copia el enlace:" : ""}
      </p>
      {result === "manual" && (
        <input readOnly value={manualUrl} aria-label={`Enlace de la mesa ${tableNumber}`}
          onFocus={(event) => event.currentTarget.select()} className={inputClass} />
      )}
    </div>
  );
}
